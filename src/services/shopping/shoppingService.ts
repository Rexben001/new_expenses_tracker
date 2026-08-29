import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { ShoppingItemRequestSchema, ShoppingPurchaseSchema } from "../../domain/models/shoppingItem";
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
const parsePurchase = (body: string) => {
  try { return ShoppingPurchaseSchema.parse(JSON.parse(body)); }
  catch (error) { throw new HttpError("Invalid purchase quantity", 400, { cause: error as Error, details: error instanceof ZodError ? error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })) : undefined }); }
};

export async function getShoppingItems(params: Params) {
  const [custom, food] = await Promise.all([
    params.shoppingDb.queryItems("PK = :pk AND begins_with(SK, :prefix)", { ":pk": { S: pk(params) }, ":prefix": { S: "SHOPPING_ITEM#" } }),
    params.inventoryDb.queryItems("PK = :pk AND begins_with(SK, :prefix)", { ":pk": { S: pk(params) }, ":prefix": { S: "FOOD_ITEM#" } }),
  ]);
  const customItems = custom.map(formatDbItem).filter((item) => item.status !== "purchased");
  const foodRemainders = new Set(customItems.filter((item) => item.source === "foodTracker" && item.foodItemId).map((item) => item.foodItemId));
  const foodItems = food.map(formatDbItem)
    .filter((item) => item.buy && !foodRemainders.has(item.id) && (!item.lifecycleStatus || item.lifecycleStatus === "active"))
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
  const item = { PK: pk(params), SK: `SHOPPING_ITEM#${id}`, id, ...input, notes: input.notes ?? "", source: "custom", status: "active", createdAt: now, updatedAt: now };
  await params.shoppingDb.putItem(item);
  return successResponse({ message: "Shopping item created", item: formatDbItem(item) }, 201);
}

export async function getShoppingHistory(params: Params) {
  const items = await params.shoppingDb.queryItems("PK = :pk AND begins_with(SK, :prefix)", { ":pk": { S: pk(params) }, ":prefix": { S: "SHOPPING_ITEM#" } });
  return successResponse(items.map(formatDbItem).filter((item) => item.status === "purchased").sort((a, b) => String(b.purchasedAt).localeCompare(String(a.purchasedAt))));
}

export async function purchaseShoppingItem(params: Params & { body: string; shoppingItemId?: string }) {
  if (!params.shoppingItemId) throw new HttpError("Shopping item ID is required", 400);
  const { quantity } = parsePurchase(params.body); const now = new Date().toISOString();
  if (params.shoppingItemId.startsWith("food-")) {
    const foodItemId = params.shoppingItemId.slice(5);
    const remainderKey = { PK: pk(params), SK: `SHOPPING_ITEM#${params.shoppingItemId}` };
    const savedRemainder = await params.shoppingDb.getItem(remainderKey).catch(() => undefined);
    const foodKey = { PK: pk(params), SK: `FOOD_ITEM#${foodItemId}` };
    const food = await params.inventoryDb.getItem(foodKey).catch(() => undefined);
    if (!food) throw new HttpError("Food Tracker item not found", 404);
    const required = Number(savedRemainder?.quantity) || Math.max(Number(food.minimumQuantity) || 1, 1);
    const remainingQuantity = Math.max(required - quantity, 0);
    await params.inventoryDb.updateItem(foodKey, "SET #quantity = :quantity, #buy = :buy, #updatedAt = :updatedAt", { "#quantity": "quantity", "#buy": "buy", "#updatedAt": "updatedAt" }, { ":quantity": Number(food.quantity) + quantity, ":buy": remainingQuantity > 0, ":updatedAt": now });
    const id = randomUUID();
    const history = { PK: pk(params), SK: `SHOPPING_ITEM#${id}`, id, name: food.name, quantity: Math.max(Number(food.minimumQuantity) || 1, 1), purchasedQuantity: quantity, unit: food.unit, category: "Food", notes: food.notes ?? "", source: "foodTracker", foodItemId, status: "purchased", purchasedAt: now, createdAt: now, updatedAt: now };
    await params.shoppingDb.putItem(history);
    let remaining;
    if (remainingQuantity > 0) {
      const remainder = { ...remainderKey, id: params.shoppingItemId, name: food.name, quantity: remainingQuantity, unit: food.unit, category: "Food", notes: food.notes ?? "", source: "foodTracker", foodItemId, status: "active", createdAt: savedRemainder?.createdAt ?? now, updatedAt: now };
      if (savedRemainder) {
        const fields = ["quantity", "updatedAt"];
        remaining = await params.shoppingDb.updateItem(remainderKey, `SET ${fields.map((field) => `#${field} = :${field}`).join(", ")}`, Object.fromEntries(fields.map((field) => [`#${field}`, field])), { ":quantity": remainingQuantity, ":updatedAt": now });
      } else { await params.shoppingDb.putItem(remainder); remaining = remainder; }
    } else if (savedRemainder) await params.shoppingDb.deleteItem(remainderKey);
    return successResponse({ message: remainingQuantity > 0 ? "Partial food purchase recorded" : "Food purchase recorded", item: formatDbItem(history), remaining: remaining ? formatDbItem(remaining) : undefined });
  }
  const key = { PK: pk(params), SK: `SHOPPING_ITEM#${params.shoppingItemId}` };
  const existing = await params.shoppingDb.getItem(key).catch(() => undefined);
  if (!existing || existing.status === "purchased") throw new HttpError("Shopping item not found", 404);
  const remainingQuantity = Math.max(Number(existing.quantity) - quantity, 0);
  if (remainingQuantity > 0) {
    const remaining = await params.shoppingDb.updateItem(key, "SET #quantity = :quantity, #updatedAt = :updatedAt", { "#quantity": "quantity", "#updatedAt": "updatedAt" }, { ":quantity": remainingQuantity, ":updatedAt": now });
    const id = randomUUID();
    const history = { ...existing, SK: `SHOPPING_ITEM#${id}`, id, status: "purchased", purchasedQuantity: quantity, purchasedAt: now, createdAt: now, updatedAt: now };
    await params.shoppingDb.putItem(history);
    return successResponse({ message: "Partial purchase recorded", item: formatDbItem(history), remaining: formatDbItem(remaining) });
  }
  const item = await params.shoppingDb.updateItem(key, "SET #status = :status, #purchasedQuantity = :purchasedQuantity, #purchasedAt = :purchasedAt, #updatedAt = :updatedAt", { "#status": "status", "#purchasedQuantity": "purchasedQuantity", "#purchasedAt": "purchasedAt", "#updatedAt": "updatedAt" }, { ":status": "purchased", ":purchasedQuantity": quantity, ":purchasedAt": now, ":updatedAt": now });
  return successResponse({ message: "Purchase recorded", item: formatDbItem(item) });
}

export async function readdShoppingItem(params: Params & { shoppingItemId?: string }) {
  if (!params.shoppingItemId) throw new HttpError("Shopping item ID is required", 400);
  const historyKey = { PK: pk(params), SK: `SHOPPING_ITEM#${params.shoppingItemId}` };
  const history = await params.shoppingDb.getItem(historyKey).catch(() => undefined);
  if (!history || history.status !== "purchased") throw new HttpError("Purchased item not found", 404);
  const quantity = Number(history.purchasedQuantity) || Number(history.quantity) || 1;
  const now = new Date().toISOString();

  if (history.source === "foodTracker" && history.foodItemId) {
    const foodKey = { PK: pk(params), SK: `FOOD_ITEM#${history.foodItemId}` };
    await params.inventoryDb.updateItem(foodKey, "SET #buy = :buy, #updatedAt = :updatedAt", { "#buy": "buy", "#updatedAt": "updatedAt" }, { ":buy": true, ":updatedAt": now });
    const id = `food-${history.foodItemId}`;
    const remainderKey = { PK: pk(params), SK: `SHOPPING_ITEM#${id}` };
    const existing = await params.shoppingDb.getItem(remainderKey).catch(() => undefined);
    let item;
    if (existing) {
      item = await params.shoppingDb.updateItem(remainderKey, "SET #quantity = :quantity, #updatedAt = :updatedAt", { "#quantity": "quantity", "#updatedAt": "updatedAt" }, { ":quantity": quantity, ":updatedAt": now });
    } else {
      item = { ...remainderKey, id, name: history.name, quantity, unit: history.unit, category: "Food", notes: history.notes ?? "", source: "foodTracker", foodItemId: history.foodItemId, status: "active", createdAt: now, updatedAt: now };
      await params.shoppingDb.putItem(item);
    }
    return successResponse({ message: "Food item added to shopping list again", item: formatDbItem(item) }, 201);
  }

  const id = randomUUID();
  const item = { PK: pk(params), SK: `SHOPPING_ITEM#${id}`, id, name: history.name, quantity, unit: history.unit, category: history.category, notes: history.notes ?? "", source: "custom", status: "active", createdAt: now, updatedAt: now };
  await params.shoppingDb.putItem(item);
  return successResponse({ message: "Item added to shopping list again", item: formatDbItem(item) }, 201);
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
    const remainderKey = { PK: pk(params), SK: `SHOPPING_ITEM#${params.shoppingItemId}` };
    const remainder = await params.shoppingDb.getItem(remainderKey).catch(() => undefined);
    if (remainder) await params.shoppingDb.deleteItem(remainderKey);
  } else {
    await params.shoppingDb.deleteItem({ PK: pk(params), SK: `SHOPPING_ITEM#${params.shoppingItemId}` });
  }
  return successResponse({ deleted: true, id: params.shoppingItemId });
}
