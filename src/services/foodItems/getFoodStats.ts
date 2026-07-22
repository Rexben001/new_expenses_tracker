import { createPk } from "../../utils/createPk";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

function summarizeConsumption(items: Record<string, any>[]) {
  const quantitiesByUnit = items.reduce<Record<string, number>>(
    (totals, item) => {
      const unit = String(item.unit || "items");
      totals[unit] = rounded((totals[unit] ?? 0) + (Number(item.quantity) || 0));
      return totals;
    },
    {}
  );

  return {
    records: items.length,
    totalQuantity: rounded(
      Object.values(quantitiesByUnit).reduce((total, value) => total + value, 0)
    ),
    quantitiesByUnit,
  };
}

function getUtcWeekStart(now: Date) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start.toISOString();
}

export const getFoodStats = async ({
  dbService,
  userId,
  subAccountId,
  now = new Date(),
}: {
  dbService: DbService;
  userId: string;
  subAccountId?: string;
  now?: Date;
}) => {
  const items = await dbService.queryItems(
    "PK = :pk AND begins_with(SK, :skPrefix)",
    {
      ":pk": { S: createPk(userId, subAccountId) },
      ":skPrefix": { S: "FOOD_ITEM#" },
    }
  );
  const period = now.toISOString().slice(0, 7);
  const today = now.toISOString().slice(0, 10);
  const weekStart = getUtcWeekStart(now);
  const allFinished = items.filter(
    (item) => item.lifecycleStatus === "finished" && item.completedAt
  );
  const completedThisMonth = items.filter(
    (item) => item.completedAt?.slice(0, 7) === period
  );
  const finished = completedThisMonth.filter(
    (item) => item.lifecycleStatus === "finished"
  );
  const wasted = completedThisMonth.filter(
    (item) => item.lifecycleStatus === "wasted"
  );
  const sum = (values: Record<string, any>[], key: string) =>
    values.reduce((total, item) => total + (Number(item[key]) || 0), 0);
  const finishedToday = allFinished.filter(
    (item) => item.completedAt.slice(0, 10) === today
  );
  const finishedThisWeek = allFinished.filter(
    (item) => item.completedAt >= weekStart
  );
  const consumedByCategory = Array.from(
    finished.reduce<Map<string, { category: string; count: number }>>(
      (totals, item) => {
        const category = String(item.category || "Other");
        const current = totals.get(category) ?? { category, count: 0 };
        current.count += 1;
        totals.set(category, current);
        return totals;
      },
      new Map()
    ).values()
  ).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  return successResponse({
    period,
    finishedCount: finished.length,
    wastedCount: wasted.length,
    savedWeightKg: rounded(sum(finished, "estimatedWeightKg")),
    wastedWeightKg: rounded(sum(wasted, "estimatedWeightKg")),
    estimatedSavings: rounded(sum(finished, "estimatedValue")),
    consumption: {
      day: summarizeConsumption(finishedToday),
      week: summarizeConsumption(finishedThisWeek),
      month: summarizeConsumption(finished),
      byCategory: consumedByCategory,
    },
  });
};
