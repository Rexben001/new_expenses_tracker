import { FoodItem } from "../../domain/models/foodItem";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { errorResponse, successResponse } from "../../utils/response";
import { sortItemByRecent } from "../../utils/sort-item";
import { DbService } from "../shared/dbService";

export const getFoodItems = async ({
  dbService,
  userId,
  foodItemId,
  subAccountId,
}: {
  dbService: DbService;
  userId: string;
  foodItemId?: string;
  subAccountId?: string;
}) => {
  const values = foodItemId
    ? {
        ":pk": { S: createPk(userId, subAccountId) },
        ":sk": { S: `FOOD_ITEM#${foodItemId}` },
      }
    : {
        ":pk": { S: createPk(userId, subAccountId) },
        ":skPrefix": { S: "FOOD_ITEM#" },
      };
  const items = await dbService.queryItems(
    foodItemId ? "PK = :pk AND SK = :sk" : "PK = :pk AND begins_with(SK, :skPrefix)",
    values
  );

  if (!items.length && foodItemId) {
    return errorResponse("Food item not found", 404);
  }

  const formatted = items
    .map(formatDbItem)
    .filter((item) => !item.lifecycleStatus || item.lifecycleStatus === "active") as FoodItem[];
  return successResponse(sortItemByRecent(formatted));
};
