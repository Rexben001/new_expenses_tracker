import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { ShoppingItemRequestSchema } from "../../domain/models/shoppingItem";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

type Params = { shoppingDb: DbService; inventoryDb: DbService; userId: string; subAccountId?: string };
const pk = (params: Params) => createPk(params.userId, params.subAccountId);
const parse = (body: string) => {
  try { return ShoppingItemRequestSchema.parse(JSON.parse(body)); }
  catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
      details: error instanceof ZodError ? error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })) : undefined,
    });
  }
};

export async function getShoppingItems(params: Params) {
  const [custom, food] = await Promise.all([
    params.shoppingDb.queryItems("PK = :pk AND begins_with(SK, :prefix)", { ":pk": { S: pk(params) }, ":prefix": { S: "SHOPPING_ITEM#" } }),
    params.inventoryDb.queryItems("PK = :pk AND begins_with(SK, :prefix)", { ":pk": { S: pk(params) }, ":prefix": { S: "FOOD_ITEM#" } }),
  ]);
  const customItems = custom.map(formatDbItem);
  const foodItems = food.map(formatDbItem)
    .filter((item) => item.buy && (!item.lifecycleStatus || item.lifecycleStatus === "active"))
    .map((item) => ({
      id: `food-${item.id}`,
      name: item.name,
      quantity: Math.max(Number(item.minimumQuantity) || 1, 1),
      unit: item.unit,
      category: "Food",
      notes: item.notes,
      source: "foodTracker",
      foodItemId: item.id,
      createdAt: item.updatedAt ?? item.createdAt,
      updatedAt: item.updatedAt,
    }));
  return successResponse([...foodItems, ...customItems].sort((a, b) => String(a.name).localeCompare(String(b.name))));
}

export async function createShoppingItem(params: Params & { body: string }) {
  const input = parse(params.body); const id = randomUUID(); const now = new Date().toISOString();
  const item = { PK: pk(params), SK: `SHOPPING_ITEM#${id}`, id, ...input, notes: input.notes ?? "", source: "custom", createdAt: now, updatedAt: now };
  await params.shoppingDb.putItem(item);
  return successResponse({ message: "Shopping item created", item: formatDbItem(item) }, 201);
}

export async function updateShoppingItem(params: Params & { body: string; shoppingItemId?: string }) {
  if (!params.shoppingItemId) throw new HttpError("Shopping item ID is required", 400);
  const input = parse(params.body); const key = { PK: pk(params), SK: `SHOPPING_ITEM#${params.shoppingItemId}` };
  const existing = await params.shoppingDb.getItem(key).catch(() => undefined);
  if (!existing) throw new HttpError("Shopping item not found", 404);
  const values = { ...input, notes: input.notes ?? "", updatedAt: new Date().toISOString() };
  const fields = Object.keys(values);
  const item = await params.shoppingDb.updateItem(key, `SET ${fields.map((field) => `#${field} = :${field}`).join(", ")}`, Object.fromEntries(fields.map((field) => [`#${field}`, field])), Object.fromEntries(fields.map((field) => [`:${field}`, values[field as keyof typeof values]])));
  return successResponse({ message: "Shopping item updated", item: formatDbItem(item) });
}

export async function deleteShoppingItem(params: Params & { shoppingItemId?: string }) {
  if (!params.shoppingItemId) throw new HttpError("Shopping item ID is required", 400);
  if (params.shoppingItemId.startsWith("food-")) {
    const foodItemId = params.shoppingItemId.slice(5);
    await params.inventoryDb.updateItem({ PK: pk(params), SK: `FOOD_ITEM#${foodItemId}` }, "SET #buy = :buy, #updatedAt = :updatedAt", { "#buy": "buy", "#updatedAt": "updatedAt" }, { ":buy": false, ":updatedAt": new Date().toISOString() });
  } else {
    await params.shoppingDb.deleteItem({ PK: pk(params), SK: `SHOPPING_ITEM#${params.shoppingItemId}` });
  }
  return successResponse({ deleted: true, id: params.shoppingItemId });
}
