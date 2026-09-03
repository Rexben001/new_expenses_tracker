import { ZodError, type ZodType } from "zod";
import {
  WardrobeDateSchema,
  WardrobeItemPayloadSchema,
  WardrobeItemUpdateSchema,
  WardrobeUploadRequestSchema,
  WardrobeWeekPlanRequestSchema,
  type WardrobeItemPayload,
  type WardrobeItemUpdate,
  type WardrobeWeekPlanRequest,
} from "../../domain/models/wardrobe";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import type { DbService } from "../shared/dbService";
import {
  WARDROBE_IMAGE_CONTENT_TYPE,
  wardrobeImageKey,
  type WardrobeImageStore,
} from "./imageStore";

const WARDROBE_ITEM_PREFIX = "WARDROBE_ITEM#";
const WARDROBE_PLAN_PREFIX = "WARDROBE_PLAN#";
const SUB_ACCOUNT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AccountParams = {
  userId: string;
  subAccountId?: string;
};

type ItemDependencies = {
  dbService: DbService;
  imageStore: WardrobeImageStore;
};

export function getWardrobeScope(subAccountId?: string) {
  if (!subAccountId) return "primary";
  if (!SUB_ACCOUNT_ID_PATTERN.test(subAccountId)) {
    throw new HttpError("Invalid sub-account ID", 400);
  }
  return subAccountId;
}

export async function createWardrobeUploadUrl({
  body,
  imageStore,
  subAccountId,
  userId,
}: AccountParams & {
  body: string;
  imageStore: WardrobeImageStore;
}) {
  parseBody(WardrobeUploadRequestSchema, body);
  return successResponse(
    await imageStore.createUploadUrl({
      userId,
      scope: getWardrobeScope(subAccountId),
    })
  );
}

export async function getWardrobeItems({
  dbService,
  imageStore,
  subAccountId,
  userId,
}: AccountParams & ItemDependencies) {
  getWardrobeScope(subAccountId);
  const items = await queryByPrefix(
    dbService,
    accountPk({ userId, subAccountId }),
    WARDROBE_ITEM_PREFIX
  );
  const sortedItems = [...items].sort((left, right) =>
    String(right.createdAt).localeCompare(String(left.createdAt))
  );
  return successResponse(
    await Promise.all(
      sortedItems.map((item) => formatWardrobeItem(item, imageStore))
    )
  );
}

export async function createWardrobeItem({
  body,
  dbService,
  imageStore,
  subAccountId,
  userId,
}: AccountParams & ItemDependencies & { body: string }) {
  const input = parseBody(WardrobeItemPayloadSchema, body);
  const scope = getWardrobeScope(subAccountId);
  assertOwnedImageKey(input, userId, scope);
  await imageStore.assertImageReady(input.imageKey);

  const now = new Date().toISOString();
  const item = {
    ...input,
    PK: accountPk({ userId, subAccountId }),
    SK: itemSk(input.id),
    createdAt: now,
    updatedAt: now,
  };
  await dbService.putItem(item);

  return successResponse(
    {
      message: "Wardrobe item created successfully",
      item: await formatWardrobeItem(item, imageStore),
    },
    201
  );
}

export async function updateWardrobeItem({
  body,
  dbService,
  imageStore,
  subAccountId,
  userId,
  wardrobeItemId,
}: AccountParams &
  ItemDependencies & {
    body: string;
    wardrobeItemId?: string;
  }) {
  const itemId = parseItemId(wardrobeItemId);
  getWardrobeScope(subAccountId);
  const input = parseBody(WardrobeItemUpdateSchema, body);
  const key = {
    PK: accountPk({ userId, subAccountId }),
    SK: itemSk(itemId),
  };
  await requireItem(dbService, key.PK, itemId);

  const updateBody: WardrobeItemUpdate & { updatedAt: string } = {
    ...input,
    updatedAt: new Date().toISOString(),
  };
  const fields = Object.keys(updateBody);
  const updated = await dbService.updateItem(
    key,
    `SET ${fields.map((field) => `#${field} = :${field}`).join(", ")}`,
    Object.fromEntries(fields.map((field) => [`#${field}`, field])),
    Object.fromEntries(
      fields.map((field) => [
        `:${field}`,
        updateBody[field as keyof typeof updateBody],
      ])
    )
  );

  return successResponse({
    message: "Wardrobe item updated successfully",
    item: await formatWardrobeItem(updated, imageStore),
  });
}

export async function deleteWardrobeItem({
  dbService,
  imageStore,
  subAccountId,
  userId,
  wardrobeItemId,
}: AccountParams &
  ItemDependencies & {
    wardrobeItemId?: string;
  }) {
  const itemId = parseItemId(wardrobeItemId);
  getWardrobeScope(subAccountId);
  const pk = accountPk({ userId, subAccountId });
  const existing = await requireItem(dbService, pk, itemId);

  await removeItemFromPlans(dbService, pk, itemId);
  await imageStore.deleteImage(String(existing.imageKey));
  await dbService.deleteItem({ PK: pk, SK: itemSk(itemId) });

  return successResponse({ deleted: true, id: itemId });
}

export async function getWardrobePlan({
  dbService,
  subAccountId,
  userId,
  weekStart,
}: AccountParams & {
  dbService: DbService;
  weekStart?: string;
}) {
  getWardrobeScope(subAccountId);
  const parsedWeekStart = parseWeekStart(weekStart);
  const items = await queryExact(
    dbService,
    accountPk({ userId, subAccountId }),
    planSk(parsedWeekStart)
  );

  return successResponse(items[0] ? formatDbItem(items[0]) : null);
}

export async function putWardrobePlan({
  body,
  dbService,
  subAccountId,
  userId,
  weekStart,
}: AccountParams & {
  body: string;
  dbService: DbService;
  weekStart?: string;
}) {
  getWardrobeScope(subAccountId);
  const parsedWeekStart = parseWeekStart(weekStart);
  const input = parseBody(WardrobeWeekPlanRequestSchema, body);
  if (input.weekStart && input.weekStart !== parsedWeekStart) {
    throw new HttpError("Plan weekStart must match the URL", 400);
  }
  assertPlanDates(input, parsedWeekStart);

  const pk = accountPk({ userId, subAccountId });
  await assertPlanItemsExist(dbService, pk, input);
  const sk = planSk(parsedWeekStart);
  const existing = (await queryExact(dbService, pk, sk))[0];
  const now = new Date().toISOString();
  let saved: Record<string, unknown>;

  if (existing) {
    saved = await dbService.updateItem(
      { PK: pk, SK: sk },
      "SET #generation = :generation, #days = :days, #updatedAt = :updatedAt",
      {
        "#generation": "generation",
        "#days": "days",
        "#updatedAt": "updatedAt",
      },
      {
        ":generation": input.generation,
        ":days": input.days,
        ":updatedAt": now,
      }
    );
  } else {
    saved = {
      PK: pk,
      SK: sk,
      weekStart: parsedWeekStart,
      generation: input.generation,
      days: input.days,
      createdAt: now,
      updatedAt: now,
    };
    await dbService.putItem(saved);
  }

  return successResponse({
    message: "Wardrobe plan saved successfully",
    plan: formatDbItem(saved),
  });
}

function accountPk(params: AccountParams) {
  return createPk(params.userId, params.subAccountId);
}

function itemSk(itemId: string) {
  return `${WARDROBE_ITEM_PREFIX}${itemId}`;
}

function planSk(weekStart: string) {
  return `${WARDROBE_PLAN_PREFIX}${weekStart}`;
}

function parseItemId(itemId?: string) {
  if (!itemId) throw new HttpError("Wardrobe item ID is required", 400);
  const result = WardrobeItemPayloadSchema.shape.id.safeParse(itemId);
  if (!result.success) throw new HttpError("Invalid wardrobe item ID", 400);
  return result.data;
}

function parseWeekStart(weekStart?: string) {
  if (!weekStart) throw new HttpError("Week start is required", 400);
  const result = WardrobeDateSchema.safeParse(weekStart);
  if (!result.success) {
    throw new HttpError("Week start must be a valid YYYY-MM-DD date", 400);
  }
  return result.data;
}

function assertOwnedImageKey(
  input: Pick<WardrobeItemPayload, "id" | "imageKey">,
  userId: string,
  scope: string
) {
  const expected = wardrobeImageKey({ userId, scope, itemId: input.id });
  if (input.imageKey !== expected) {
    throw new HttpError("Image key does not match this user and item", 400);
  }
}

async function formatWardrobeItem(
  item: Record<string, any>,
  imageStore: WardrobeImageStore
) {
  return {
    ...formatDbItem(item),
    imageUrl: await imageStore.createImageUrl(String(item.imageKey)),
  };
}

async function requireItem(dbService: DbService, pk: string, itemId: string) {
  const item = (await queryExact(dbService, pk, itemSk(itemId)))[0];
  if (!item) throw new HttpError("Wardrobe item not found", 404);
  return item;
}

async function queryByPrefix(
  dbService: DbService,
  pk: string,
  prefix: string
) {
  return dbService.queryItems(
    "PK = :pk AND begins_with(SK, :prefix)",
    { ":pk": { S: pk }, ":prefix": { S: prefix } }
  );
}

async function queryExact(dbService: DbService, pk: string, sk: string) {
  return dbService.queryItems("PK = :pk AND SK = :sk", {
    ":pk": { S: pk },
    ":sk": { S: sk },
  });
}

async function assertPlanItemsExist(
  dbService: DbService,
  pk: string,
  plan: WardrobeWeekPlanRequest
) {
  const referencedIds = new Set(plan.days.flatMap((day) => day.itemIds));
  if (!referencedIds.size) return;

  const items = await queryByPrefix(dbService, pk, WARDROBE_ITEM_PREFIX);
  const savedIds = new Set(items.map((item) => String(item.id)));
  const missing = [...referencedIds].filter((id) => !savedIds.has(id));
  if (missing.length) {
    throw new HttpError("Plan contains wardrobe items that do not exist", 400, {
      details: { missingItemIds: missing },
    });
  }
}

async function removeItemFromPlans(
  dbService: DbService,
  pk: string,
  itemId: string
) {
  const plans = await queryByPrefix(dbService, pk, WARDROBE_PLAN_PREFIX);
  for (const plan of plans) {
    if (!Array.isArray(plan.days)) continue;

    let changed = false;
    const days = plan.days.map((day: Record<string, unknown>) => {
      const itemIds = Array.isArray(day.itemIds)
        ? day.itemIds.filter((id) => id !== itemId)
        : [];
      const lockedItemIds = Array.isArray(day.lockedItemIds)
        ? day.lockedItemIds.filter((id) => id !== itemId)
        : [];
      if (
        itemIds.length !== (Array.isArray(day.itemIds) ? day.itemIds.length : 0) ||
        lockedItemIds.length !==
          (Array.isArray(day.lockedItemIds) ? day.lockedItemIds.length : 0)
      ) {
        changed = true;
      }
      return { ...day, itemIds, lockedItemIds };
    });

    if (!changed || typeof plan.SK !== "string") continue;
    await dbService.updateItem(
      { PK: pk, SK: plan.SK },
      "SET #days = :days, #updatedAt = :updatedAt",
      { "#days": "days", "#updatedAt": "updatedAt" },
      { ":days": days, ":updatedAt": new Date().toISOString() }
    );
  }
}

function assertPlanDates(plan: WardrobeWeekPlanRequest, weekStart: string) {
  const allowedDates = new Set<string>();
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    allowedDates.add(date.toISOString().slice(0, 10));
  }

  const seenDates = new Set<string>();
  for (const day of plan.days) {
    if (!allowedDates.has(day.date)) {
      throw new HttpError("Plan days must fall within the requested week", 400);
    }
    if (seenDates.has(day.date)) {
      throw new HttpError("Plan day dates must be unique", 400);
    }
    seenDates.add(day.date);
  }
}

function parseBody<T>(schema: ZodType<T>, body: string): T {
  try {
    return schema.parse(JSON.parse(body));
  } catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
      details:
        error instanceof ZodError
          ? error.issues.map((issue) => ({
              path: issue.path.join("."),
              code: issue.code,
              message: issue.message,
            }))
          : undefined,
    });
  }
}

export { WARDROBE_IMAGE_CONTENT_TYPE };
