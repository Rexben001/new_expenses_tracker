import type { APIGatewayEvent, Context } from "aws-lambda";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import {
  DecryptCommand,
  EncryptCommand,
  type KMSClient,
} from "@aws-sdk/client-kms";
import {
  HowToCreateRequestSchema,
  HowToSecretInput,
  HowToUpdateRequestSchema,
} from "../../domain/models/howTo";
import { DbService } from "../../services/shared/dbService";
import { assertAdmin, normalizeEmail } from "../../utils/admin";
import { getUserId } from "../../utils/getUserId";
import { HttpError } from "../../utils/http-error";
import { createInvocationLogger } from "../../utils/logger";
import { errorResponseFromError, successResponse } from "../../utils/response";

type HowToItem = {
  PK: string;
  SK: string;
  id: string;
  title: string;
  category: string;
  tags: string[];
  keywords: string[];
  summary: string;
  contentJson: unknown;
  contentPlainText: string;
  loginDetails: {
    url: string;
    email: string;
    username: string;
    notes: string;
  };
  encryptedSecrets?: EncryptedSecret[];
  hasSecrets: boolean;
  secretLabels: SecretLabel[];
  createdAt: string;
  updatedAt: string;
  createdByEmail: string;
  updatedByEmail: string;
  searchText: string;
};

type EncryptedSecret = SecretLabel & {
  ciphertext: string;
};

type SecretLabel = {
  id: string;
  label: string;
  updatedAt: string;
};

const HOW_TO_PK = "HOWTO";
const HOW_TO_SK_PREFIX = "ITEM#";
const EMPTY_DOC = { type: "doc", content: [] };
const MAX_SECRET_BYTES = 4096;

export const makeHandler = ({
  dbService,
  kmsClient,
}: {
  dbService: DbService;
  kmsClient: KMSClient;
}) => {
  return async (event: APIGatewayEvent, context: Context) => {
    const logger = createInvocationLogger(context, {
      handler: "handleHowTo",
      path: event.path,
      method: event.httpMethod,
    });

    try {
      assertAdmin(event);
      getUserId(event);

      const howToId = event.pathParameters?.howToId;
      const isSecretsRoute = event.path.endsWith("/secrets");

      if (isSecretsRoute) {
        if (event.httpMethod === "GET" && howToId) {
          return await revealSecrets({ dbService, kmsClient, howToId });
        }

        throw new HttpError("Method not allowed", 405);
      }

      if (!howToId) {
        if (event.httpMethod === "GET") {
          return await listHowToItems({ dbService, event });
        }

        if (event.httpMethod === "POST") {
          return await createHowToItem({ dbService, kmsClient, event });
        }

        throw new HttpError("Method not allowed", 405);
      }

      if (event.httpMethod === "GET") {
        const item = await getHowToItem({ dbService, howToId });
        return successResponse(toSafeItem(item, getQuery(event)));
      }

      if (event.httpMethod === "PUT") {
        return await updateHowToItem({ dbService, kmsClient, event, howToId });
      }

      if (event.httpMethod === "DELETE") {
        await getHowToItem({ dbService, howToId });
        await dbService.deleteItem({ PK: HOW_TO_PK, SK: toSk(howToId) });
        return successResponse({ deleted: true, id: howToId });
      }

      throw new HttpError("Method not allowed", 405);
    } catch (error) {
      logger.error("Error handling how-to request", { error });
      return errorResponseFromError(error, "How-To request failed");
    }
  };
};

async function listHowToItems({
  dbService,
  event,
}: {
  dbService: DbService;
  event: APIGatewayEvent;
}) {
  const query = getQuery(event);
  const category = normalizeSearch(event.queryStringParameters?.category);
  const tag = normalizeSearch(event.queryStringParameters?.tag);
  const limit = parseLimit(event.queryStringParameters?.limit);
  const offset = parseCursor(event.queryStringParameters?.cursor);

  const items = (await queryAllHowToItems(dbService))
    .filter((item) => matchesFilters(item, { query, category, tag }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + limit;

  return successResponse({
    items: page.map((item) => toSafeItem(item, query)),
    count: page.length,
    total: items.length,
    limit,
    query,
    category,
    tag,
    nextCursor: nextOffset < items.length ? encodeCursor(nextOffset) : null,
  });
}

async function createHowToItem({
  dbService,
  kmsClient,
  event,
}: {
  dbService: DbService;
  kmsClient: KMSClient;
  event: APIGatewayEvent;
}) {
  const body = parseBody(event.body);
  const parsed = parseCreateRequest(body);
  const id = randomUUID();
  const now = new Date().toISOString();
  const email = getRequesterEmail(event);
  const contentJson = parsed.contentJson ?? EMPTY_DOC;
  const contentPlainText = extractPlainText(contentJson);
  const encryptedSecrets = await encryptSecrets({
    kmsClient,
    howToId: id,
    secrets: parsed.secrets,
    now,
  });
  const secretLabels = encryptedSecrets.map(toSecretLabel);

  const item: HowToItem = {
    PK: HOW_TO_PK,
    SK: toSk(id),
    id,
    title: parsed.title,
    category: normalizeTextField(parsed.category),
    tags: normalizeStringArray(parsed.tags),
    keywords: normalizeStringArray(parsed.keywords),
    summary: normalizeTextField(parsed.summary),
    contentJson,
    contentPlainText,
    loginDetails: normalizeLoginDetails(parsed.loginDetails),
    encryptedSecrets,
    hasSecrets: encryptedSecrets.length > 0,
    secretLabels,
    createdAt: now,
    updatedAt: now,
    createdByEmail: email,
    updatedByEmail: email,
    searchText: "",
  };
  item.searchText = buildSearchText(item);

  await dbService.putItem(item);

  return successResponse(
    {
      message: "How-To item created successfully",
      item: toSafeItem(item),
    },
    201
  );
}

async function updateHowToItem({
  dbService,
  kmsClient,
  event,
  howToId,
}: {
  dbService: DbService;
  kmsClient: KMSClient;
  event: APIGatewayEvent;
  howToId: string;
}) {
  const existing = await getHowToItem({ dbService, howToId });
  const body = parseBody(event.body);
  const parsed = parseUpdateRequest(body);
  const now = new Date().toISOString();
  const patch: Partial<HowToItem> = {
    updatedAt: now,
    updatedByEmail: getRequesterEmail(event),
  };

  if (parsed.title !== undefined) patch.title = parsed.title.trim();
  if (parsed.category !== undefined) {
    patch.category = normalizeTextField(parsed.category);
  }
  if (parsed.tags !== undefined) patch.tags = normalizeStringArray(parsed.tags);
  if (parsed.keywords !== undefined) {
    patch.keywords = normalizeStringArray(parsed.keywords);
  }
  if (parsed.summary !== undefined) {
    patch.summary = normalizeTextField(parsed.summary);
  }
  if (parsed.contentJson !== undefined) {
    patch.contentJson = parsed.contentJson ?? EMPTY_DOC;
    patch.contentPlainText = extractPlainText(patch.contentJson);
  }
  if (parsed.loginDetails !== undefined) {
    patch.loginDetails = normalizeLoginDetails(parsed.loginDetails);
  }
  if ("secrets" in body) {
    const encryptedSecrets = await encryptSecrets({
      kmsClient,
      howToId,
      secrets: parsed.secrets ?? [],
      now,
    });
    patch.encryptedSecrets = encryptedSecrets;
    patch.secretLabels = encryptedSecrets.map(toSecretLabel);
    patch.hasSecrets = encryptedSecrets.length > 0;
  }

  const merged = { ...existing, ...patch };
  patch.searchText = buildSearchText(merged);

  const updated = await updateItemPatch({
    dbService,
    howToId,
    patch,
  });

  return successResponse({
    message: "How-To item updated successfully",
    item: toSafeItem(updated),
  });
}

async function revealSecrets({
  dbService,
  kmsClient,
  howToId,
}: {
  dbService: DbService;
  kmsClient: KMSClient;
  howToId: string;
}) {
  const item = await getHowToItem({ dbService, howToId });
  const secrets = await Promise.all(
    (item.encryptedSecrets ?? []).map(async (secret) => ({
      id: secret.id,
      label: secret.label,
      value: await decryptSecret({
        kmsClient,
        howToId,
        ciphertext: secret.ciphertext,
      }),
    }))
  );

  return successResponse({ id: howToId, secrets });
}

async function updateItemPatch({
  dbService,
  howToId,
  patch,
}: {
  dbService: DbService;
  howToId: string;
  patch: Partial<HowToItem>;
}) {
  const entries = Object.entries(patch).filter(
    ([, value]) => value !== undefined
  );

  if (!entries.length) {
    throw new HttpError("At least one field is required for updating", 400);
  }

  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};
  const updateExpression = entries
    .map(([key, value]) => {
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = value;
      return `#${key} = :${key}`;
    })
    .join(", ");

  return (await dbService.updateItem(
    { PK: HOW_TO_PK, SK: toSk(howToId) },
    `SET ${updateExpression}`,
    expressionAttributeNames,
    expressionAttributeValues
  )) as HowToItem;
}

async function getHowToItem({
  dbService,
  howToId,
}: {
  dbService: DbService;
  howToId: string;
}) {
  const [item] = await dbService.queryItems(
    "PK = :pk AND SK = :sk",
    {
      ":pk": { S: HOW_TO_PK },
      ":sk": { S: toSk(howToId) },
    }
  );

  if (!item) throw new HttpError("How-To item not found", 404);
  return item as HowToItem;
}

async function queryAllHowToItems(dbService: DbService) {
  return (await dbService.queryItems(
    "PK = :pk AND begins_with(SK, :skPrefix)",
    {
      ":pk": { S: HOW_TO_PK },
      ":skPrefix": { S: HOW_TO_SK_PREFIX },
    }
  )) as HowToItem[];
}

async function encryptSecrets({
  kmsClient,
  howToId,
  secrets,
  now,
}: {
  kmsClient: KMSClient;
  howToId: string;
  secrets: HowToSecretInput[];
  now: string;
}) {
  if (!secrets.length) return [];

  const keyId = requireEnv("HOW_TO_KMS_KEY_ID", process.env.HOW_TO_KMS_KEY_ID);

  return Promise.all(
    secrets.map(async (secret) => {
      const plaintext = Buffer.from(secret.value, "utf8");
      if (plaintext.byteLength > MAX_SECRET_BYTES) {
        throw new HttpError("Secret values must be 4 KB or smaller", 400);
      }

      const result = await kmsClient.send(
        new EncryptCommand({
          KeyId: keyId,
          Plaintext: plaintext,
          EncryptionContext: getEncryptionContext(howToId),
        })
      );

      if (!result.CiphertextBlob) {
        throw new Error("KMS did not return ciphertext");
      }

      return {
        id: secret.id || randomUUID(),
        label: secret.label.trim(),
        ciphertext: Buffer.from(result.CiphertextBlob).toString("base64"),
        updatedAt: now,
      };
    })
  );
}

async function decryptSecret({
  kmsClient,
  howToId,
  ciphertext,
}: {
  kmsClient: KMSClient;
  howToId: string;
  ciphertext: string;
}) {
  const result = await kmsClient.send(
    new DecryptCommand({
      CiphertextBlob: Buffer.from(ciphertext, "base64"),
      EncryptionContext: getEncryptionContext(howToId),
    })
  );

  if (!result.Plaintext) {
    throw new Error("KMS did not return plaintext");
  }

  return Buffer.from(result.Plaintext).toString("utf8");
}

function getEncryptionContext(howToId: string) {
  return {
    purpose: "how-to-secret",
    howToId,
  };
}

function toSafeItem(item: HowToItem, query = "") {
  const {
    PK,
    SK,
    encryptedSecrets,
    searchText,
    ...safeItem
  } = item;

  void PK;
  void SK;
  void encryptedSecrets;
  void searchText;

  return {
    ...safeItem,
    snippet: buildSnippet(item, query),
  };
}

function toSecretLabel(secret: EncryptedSecret): SecretLabel {
  return {
    id: secret.id,
    label: secret.label,
    updatedAt: secret.updatedAt,
  };
}

function matchesFilters(
  item: HowToItem,
  {
    query,
    category,
    tag,
  }: {
    query: string;
    category: string;
    tag: string;
  }
) {
  if (category && normalizeSearch(item.category) !== category) return false;
  if (tag && !item.tags.map(normalizeSearch).includes(tag)) return false;
  if (!query) return true;
  return normalizeSearch(item.searchText).includes(query);
}

function buildSnippet(item: HowToItem, query = "") {
  const fallback = item.summary || item.contentPlainText || item.loginDetails.notes;
  if (!query) return truncate(fallback, 180);

  const source = [item.summary, item.contentPlainText, item.searchText]
    .filter(Boolean)
    .join(" ");
  const normalizedSource = normalizeSearch(source);
  const index = normalizedSource.indexOf(query);
  if (index < 0) return truncate(fallback, 180);

  const start = Math.max(0, index - 60);
  const end = Math.min(source.length, index + query.length + 120);
  return `${start > 0 ? "..." : ""}${source.slice(start, end).trim()}${
    end < source.length ? "..." : ""
  }`;
}

function buildSearchText(item: HowToItem) {
  return normalizeSearch(
    [
      item.title,
      item.category,
      item.tags.join(" "),
      item.keywords.join(" "),
      item.summary,
      item.contentPlainText,
      item.loginDetails.url,
      item.loginDetails.email,
      item.loginDetails.username,
      item.loginDetails.notes,
    ].join(" ")
  );
}

function extractPlainText(value: unknown): string {
  const parts: string[] = [];

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;

    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") {
      parts.push(record.text);
    }

    if (Array.isArray(record.content)) {
      record.content.forEach(walk);
    }
  };

  walk(value);
  return normalizeTextField(parts.join(" "));
}

function normalizeStringArray(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeTextField(value))
        .filter(Boolean)
    )
  );
}

function normalizeLoginDetails(
  loginDetails: Record<string, unknown> | undefined
) {
  return {
    url: normalizeTextField(loginDetails?.url),
    email: normalizeEmail(loginDetails?.email),
    username: normalizeTextField(loginDetails?.username),
    notes: normalizeTextField(loginDetails?.notes),
  };
}

function normalizeTextField(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSearch(value: unknown) {
  return normalizeTextField(value).toLowerCase();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}

function parseBody(body: string | null) {
  if (!body) return {};

  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new HttpError("Invalid JSON body", 400);
  }
}

function parseCreateRequest(body: Record<string, unknown>) {
  try {
    return HowToCreateRequestSchema.parse(body);
  } catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
    });
  }
}

function parseUpdateRequest(body: Record<string, unknown>) {
  try {
    return HowToUpdateRequestSchema.parse(body);
  } catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
    });
  }
}

function parseLimit(input: string | undefined) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function parseCursor(input: string | undefined) {
  if (!input) return 0;

  const parsed = Number(Buffer.from(input, "base64url").toString("utf8"));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function encodeCursor(offset: number) {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function getQuery(event: APIGatewayEvent) {
  return normalizeSearch(event.queryStringParameters?.query);
}

function toSk(id: string) {
  return `${HOW_TO_SK_PREFIX}${id}`;
}

function getRequesterEmail(event: APIGatewayEvent) {
  return normalizeEmail(event.requestContext?.authorizer?.claims?.email);
}

function requireEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
