import { randomUUID } from "crypto";
import { DEFAULT_MEALS, MealRequestSchema, MealTypeSchema, ScheduleRequestSchema, WeekdaySchema, type MealIngredient } from "../../domain/models/mealPlan";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

type Params = { planDb: DbService; inventoryDb: DbService; userId: string; subAccountId?: string };
const parse = <T>(schema: { parse(value: unknown): T }, body: string): T => {
  try { return schema.parse(JSON.parse(body)); } catch (error) { throw new HttpError("Invalid request body", 400, { cause: error as Error }); }
};
const pk = (p: Pick<Params, "userId" | "subAccountId">) => createPk(p.userId, p.subAccountId);

export async function getMealPlan(params: Params) {
  const items = (await params.planDb.queryItems("PK = :pk AND begins_with(SK, :prefix)", {
    ":pk": { S: pk(params) }, ":prefix": { S: "MEAL" },
  })).map(formatDbItem);
  const customMeals = items.filter((item) => item.recordType === "meal");
  const schedule = items.filter((item) => item.recordType === "schedule");
  return successResponse({ meals: [...DEFAULT_MEALS, ...customMeals], schedule });
}

export async function createMeal(params: Params & { body: string }) {
  const input = parse(MealRequestSchema, params.body);
  const now = new Date().toISOString();
  const item = { PK: pk(params), SK: `MEAL#${randomUUID()}`, id: randomUUID(), recordType: "meal", ...input, createdAt: now, updatedAt: now };
  item.SK = `MEAL#${item.id}`;
  await params.planDb.putItem(item);
  return successResponse({ message: "Meal created successfully", item: formatDbItem(item) }, 201);
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

export async function setSchedule(params: Params & { body: string; day?: string; mealType?: string }) {
  const day = WeekdaySchema.parse(params.day);
  const mealType = MealTypeSchema.parse(params.mealType);
  const { mealId } = parse(ScheduleRequestSchema, params.body);
  const custom = mealId.startsWith("default-") ? undefined : await params.planDb.getItem({ PK: pk(params), SK: `MEAL#${mealId}` }).catch(() => undefined);
  const meal = DEFAULT_MEALS.find((value) => value.id === mealId) ?? (custom ? formatDbItem(custom) : undefined);
  if (!meal) throw new HttpError("Meal not found", 404);

  const inventory = (await params.inventoryDb.queryItems("PK = :pk AND begins_with(SK, :prefix)", {
    ":pk": { S: pk(params) }, ":prefix": { S: "FOOD_ITEM#" },
  })).map(formatDbItem).filter((item) => !item.lifecycleStatus || item.lifecycleStatus === "active");
  const warnings = meal.ingredients.map((ingredient: MealIngredient) => {
    const food = inventory.find((item) => ingredient.foodItemId ? item.id === ingredient.foodItemId :
      String(item.name).trim().toLowerCase() === ingredient.name.trim().toLowerCase() && String(item.unit).trim().toLowerCase() === ingredient.unit.trim().toLowerCase());
    if (!food) return { ingredient: ingredient.name, severity: "missing", message: `${ingredient.name} is missing from food tracker` };
    const remaining = Number(food.quantity) - ingredient.quantity;
    if (remaining < 0) return { ingredient: ingredient.name, severity: "insufficient", message: `${ingredient.name} needs ${ingredient.quantity} ${ingredient.unit}; only ${food.quantity} available` };
    if (remaining <= Number(food.minimumQuantity)) return { ingredient: ingredient.name, severity: "low", message: `${ingredient.name} will be low (${remaining} ${ingredient.unit} left)` };
    return undefined;
  }).filter(Boolean);

  const now = new Date().toISOString();
  const item = { PK: pk(params), SK: `MEAL_SCHEDULE#${day}#${mealType}`, id: `${day}-${mealType}`, recordType: "schedule", day, mealType, mealId, mealName: meal.name, warnings, updatedAt: now };
  const existing = await params.planDb.getItem({ PK: item.PK, SK: item.SK }).catch(() => undefined);
  if (existing) {
    const fields = ["mealId", "mealName", "warnings", "updatedAt"];
    await params.planDb.updateItem({ PK: item.PK, SK: item.SK }, `SET ${fields.map((x) => `#${x} = :${x}`).join(", ")}`, Object.fromEntries(fields.map((x) => [`#${x}`, x])), Object.fromEntries(fields.map((x) => [`:${x}`, item[x as keyof typeof item]])));
  } else await params.planDb.putItem(item);
  return successResponse({ message: warnings.length ? "Meal scheduled with ingredient warnings" : "Meal scheduled", item: formatDbItem(item), warnings });
}

export async function clearSchedule(params: Params & { day?: string; mealType?: string }) {
  const day = WeekdaySchema.parse(params.day); const mealType = MealTypeSchema.parse(params.mealType);
  await params.planDb.deleteItem({ PK: pk(params), SK: `MEAL_SCHEDULE#${day}#${mealType}` });
  return successResponse({ deleted: true });
}
