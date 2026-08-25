import { randomUUID } from "crypto";
import { DEFAULT_MEALS, MealRequestSchema, MealTypeSchema, ScheduleRequestSchema, type MealIngredient } from "../../domain/models/mealPlan";
import { ZodError } from "zod";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

type Params = { planDb: DbService; inventoryDb: DbService; userId: string; subAccountId?: string };
const parse = <T>(schema: { parse(value: unknown): T }, body: string): T => {
  try { return schema.parse(JSON.parse(body)); } catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
      details: error instanceof ZodError
        ? error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message }))
        : undefined,
    });
  }
};
const pk = (p: Pick<Params, "userId" | "subAccountId">) => createPk(p.userId, p.subAccountId);

export async function getMealPlan(params: Params) {
  const items = (await params.planDb.queryItems("PK = :pk AND begins_with(SK, :prefix)", {
    ":pk": { S: pk(params) }, ":prefix": { S: "MEAL" },
  })).map(formatDbItem);
  const customMeals = items.filter((item) => item.recordType === "meal");
  const overrides = new Map(
    items
      .filter((item) => item.recordType === "mealOverride")
      .map((item) => [item.id, item])
  );
  const schedule = items.filter((item) => item.recordType === "schedule");
  const defaultMeals = DEFAULT_MEALS.map((meal) => overrides.get(meal.id) ?? meal);
  return successResponse({ meals: [...defaultMeals, ...customMeals], schedule });
}

export async function createMeal(params: Params & { body: string }) {
  const input = parse(MealRequestSchema, params.body);
  const ingredients = await linkOrCreateIngredients(params, input.ingredients);
  const now = new Date().toISOString();
  const item = { PK: pk(params), SK: `MEAL#${randomUUID()}`, id: randomUUID(), recordType: "meal", ...input, ingredients, createdAt: now, updatedAt: now };
  item.SK = `MEAL#${item.id}`;
  await params.planDb.putItem(item);
  return successResponse({ message: "Meal created successfully", item: formatDbItem(item) }, 201);
}

export async function updateMeal(params: Params & { body: string; mealId?: string }) {
  if (!params.mealId) throw new HttpError("Meal ID is required", 400);
  const input = parse(MealRequestSchema, params.body);
  const ingredients = await linkOrCreateIngredients(params, input.ingredients);
  const isDefault = params.mealId.startsWith("default-");
  const defaultMeal = DEFAULT_MEALS.find((meal) => meal.id === params.mealId);
  if (isDefault && !defaultMeal) throw new HttpError("Default meal not found", 404);
  const key = {
    PK: pk(params),
    SK: isDefault ? `MEAL_OVERRIDE#${params.mealId}` : `MEAL#${params.mealId}`,
  };
  const existing = await params.planDb.getItem(key).catch(() => undefined);
  if (!isDefault && (!existing || existing.recordType !== "meal")) {
    throw new HttpError("Meal not found", 404);
  }
  const values = {
    name: input.name,
    description: input.description ?? "",
    ingredients,
    updatedAt: new Date().toISOString(),
  };
  if (isDefault && !existing) {
    const now = new Date().toISOString();
    const item = {
      ...key,
      id: params.mealId,
      recordType: "mealOverride",
      ...values,
      createdAt: now,
    };
    await params.planDb.putItem(item);
    return successResponse({ message: "Default meal updated successfully", item: formatDbItem(item) });
  }
  const fields = Object.keys(values);
  const item = await params.planDb.updateItem(
    key,
    `SET ${fields.map((field) => `#${field} = :${field}`).join(", ")}`,
    Object.fromEntries(fields.map((field) => [`#${field}`, field])),
    Object.fromEntries(fields.map((field) => [`:${field}`, values[field as keyof typeof values]]))
  );
  return successResponse({ message: "Meal updated successfully", item: formatDbItem(item) });
}

async function linkOrCreateIngredients(
  params: Params,
  ingredients: MealIngredient[]
) {
  const inventory = (await params.inventoryDb.queryItems(
    "PK = :pk AND begins_with(SK, :prefix)",
    { ":pk": { S: pk(params) }, ":prefix": { S: "FOOD_ITEM#" } }
  )).map(formatDbItem);
  const available = inventory.filter(
    (item) => !item.lifecycleStatus || item.lifecycleStatus === "active"
  );

  const linked: MealIngredient[] = [];
  for (const ingredient of ingredients) {
    const normalizedName = ingredient.name.trim().toLowerCase();
    const normalizedUnit = ingredient.unit.trim().toLowerCase();
    const existingInventory = ingredient.foodItemId
      ? inventory.find((item) => item.id === ingredient.foodItemId)
      : available.find(
          (item) =>
            String(item.name).trim().toLowerCase() === normalizedName &&
            String(item.unit).trim().toLowerCase() === normalizedUnit
        );
    const existingLinked = linked.find(
      (item) =>
        item.name.trim().toLowerCase() === normalizedName &&
        item.unit.trim().toLowerCase() === normalizedUnit
    );

    if (existingInventory?.id || existingLinked?.foodItemId) {
      linked.push({
        ...ingredient,
        foodItemId: String(existingInventory?.id ?? existingLinked?.foodItemId),
      });
      continue;
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    await params.inventoryDb.putItem({
      PK: pk(params),
      SK: `FOOD_ITEM#${id}`,
      id,
      name: ingredient.name,
      category: "ingredient",
      quantity: 1,
      unit: ingredient.unit,
      minimumQuantity: 1,
      location: "Pantry",
      buy: false,
      opened: false,
      preparationState: "raw",
      lifecycleStatus: "active",
      freezable: false,
      createdAt: now,
      updatedAt: now,
    });
    linked.push({ ...ingredient, foodItemId: id });
  }
  return linked;
}

export async function deleteMeal(params: Params & { mealId?: string }) {
  if (!params.mealId || params.mealId.startsWith("default-")) throw new HttpError("Custom meal ID is required", 400);
  await params.planDb.deleteItem({ PK: pk(params), SK: `MEAL#${params.mealId}` });
  const entries = await params.planDb.queryItems("PK = :pk AND begins_with(SK, :prefix)", {
    ":pk": { S: pk(params) }, ":prefix": { S: "MEAL_SCHEDULE#" },
  });
  await Promise.all(entries.filter((entry) => entry.mealId === params.mealId).map((entry) =>
    params.planDb.deleteItem({ PK: pk(params), SK: entry.SK })
  ));
  return successResponse({ deleted: true, id: params.mealId });
}

export async function setSchedule(params: Params & { body: string; date?: string; mealType?: string }) {
  if (!params.date || !/^\d{4}-\d{2}-\d{2}$/.test(params.date) || Number.isNaN(new Date(`${params.date}T00:00:00Z`).getTime())) {
    throw new HttpError("Valid schedule date is required", 400);
  }
  const mealType = MealTypeSchema.parse(params.mealType);
  const input = parse(ScheduleRequestSchema, params.body);
  const scheduleKey = { PK: pk(params), SK: `MEAL_SCHEDULE#${params.date}#${mealType}` };
  const existing = await params.planDb.getItem(scheduleKey).catch(() => undefined);
  const mealId = input.mealId ?? existing?.mealId;
  if (!mealId) throw new HttpError("Meal is required before marking slot cooked", 400);
  const isDefault = mealId.startsWith("default-");
  const savedMeal = await params.planDb.getItem({
    PK: pk(params),
    SK: isDefault ? `MEAL_OVERRIDE#${mealId}` : `MEAL#${mealId}`,
  }).catch(() => undefined);
  const meal = savedMeal
    ? formatDbItem(savedMeal)
    : DEFAULT_MEALS.find((value) => value.id === mealId);
  if (!meal) throw new HttpError("Meal not found", 404);

  const inventory = (await params.inventoryDb.queryItems("PK = :pk AND begins_with(SK, :prefix)", {
    ":pk": { S: pk(params) }, ":prefix": { S: "FOOD_ITEM#" },
  })).map(formatDbItem).filter((item) => !item.lifecycleStatus || item.lifecycleStatus === "active");
  const warnings = (input.mealId ? meal.ingredients : []).map((ingredient: MealIngredient) => {
    const food = inventory.find((item) => ingredient.foodItemId ? item.id === ingredient.foodItemId :
      String(item.name).trim().toLowerCase() === ingredient.name.trim().toLowerCase() && String(item.unit).trim().toLowerCase() === ingredient.unit.trim().toLowerCase());
    if (!food) return { ingredient: ingredient.name, severity: "missing", message: `${ingredient.name} is missing from food tracker` };
    const remaining = Number(food.quantity) - ingredient.quantity;
    if (remaining < 0) return { ingredient: ingredient.name, severity: "insufficient", message: `${ingredient.name} needs ${ingredient.quantity} ${ingredient.unit}; only ${food.quantity} available` };
    if (remaining <= Number(food.minimumQuantity)) return { ingredient: ingredient.name, severity: "low", message: `${ingredient.name} will be low (${remaining} ${ingredient.unit} left)` };
    return undefined;
  }).filter(Boolean);

  const now = new Date().toISOString();
  const day = new Date(`${params.date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toLowerCase();
  const item = { ...scheduleKey, id: `${params.date}-${mealType}`, recordType: "schedule", date: params.date, day, mealType, mealId, mealName: meal.name, warnings: input.mealId ? warnings : (existing?.warnings ?? []), cooked: input.cooked ?? (input.mealId ? false : Boolean(existing?.cooked)), cookedAt: input.cooked ? now : (input.cooked === false ? "" : existing?.cookedAt ?? ""), updatedAt: now };
  if (existing) {
    const fields = ["date", "day", "mealId", "mealName", "warnings", "cooked", "cookedAt", "updatedAt"];
    await params.planDb.updateItem({ PK: item.PK, SK: item.SK }, `SET ${fields.map((x) => `#${x} = :${x}`).join(", ")}`, Object.fromEntries(fields.map((x) => [`#${x}`, x])), Object.fromEntries(fields.map((x) => [`:${x}`, item[x as keyof typeof item]])));
  } else await params.planDb.putItem(item);
  return successResponse({ message: warnings.length ? "Meal scheduled with ingredient warnings" : "Meal scheduled", item: formatDbItem(item), warnings });
}

export async function clearSchedule(params: Params & { date?: string; mealType?: string }) {
  if (!params.date || !/^\d{4}-\d{2}-\d{2}$/.test(params.date)) throw new HttpError("Valid schedule date is required", 400);
  const mealType = MealTypeSchema.parse(params.mealType);
  await params.planDb.deleteItem({ PK: pk(params), SK: `MEAL_SCHEDULE#${params.date}#${mealType}` });
  return successResponse({ deleted: true });
}
