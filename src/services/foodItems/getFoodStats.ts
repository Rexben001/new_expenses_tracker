import { createPk } from "../../utils/createPk";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

function rounded(value: number) {
  return Math.round(value * 100) / 100;
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

  return successResponse({
    period,
    finishedCount: finished.length,
    wastedCount: wasted.length,
    savedWeightKg: rounded(sum(finished, "estimatedWeightKg")),
    wastedWeightKg: rounded(sum(wasted, "estimatedWeightKg")),
    estimatedSavings: rounded(sum(finished, "estimatedValue")),
  });
};
