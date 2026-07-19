import { createPk } from "../../utils/createPk";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const deleteFoodItem = async ({
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
  if (!foodItemId) throw new HttpError("Food item ID is required", 400);

  await dbService.deleteItem({
    PK: createPk(userId, subAccountId),
    SK: `FOOD_ITEM#${foodItemId}`,
  });

  return successResponse({ message: "Food item deleted successfully" });
};
