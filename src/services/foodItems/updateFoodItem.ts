import { FoodItemUpdateRequestSchema } from "../../domain/models/foodItem";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const updateFoodItem = async ({
  dbService,
  body,
  userId,
  foodItemId,
  subAccountId,
}: {
  dbService: DbService;
  body: string;
  userId: string;
  foodItemId?: string;
  subAccountId?: string;
}) => {
  if (!foodItemId) throw new HttpError("Food item ID is required", 400);

  let parsedBody: Record<string, unknown>;
  try {
    parsedBody = FoodItemUpdateRequestSchema.parse(JSON.parse(body));
  } catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
    });
  }

  const updateBody = {
    ...parsedBody,
    updatedAt: new Date().toISOString(),
  };
  const keys = Object.keys(updateBody);
  const item = await dbService.updateItem(
    {
      PK: createPk(userId, subAccountId),
      SK: `FOOD_ITEM#${foodItemId}`,
    },
    `SET ${keys.map((key) => `#${key} = :${key}`).join(", ")}`,
    Object.fromEntries(keys.map((key) => [`#${key}`, key])),
    Object.fromEntries(keys.map((key) => [`:${key}`, updateBody[key as keyof typeof updateBody]]))
  );

  return successResponse({
    message: "Food item updated successfully",
    item: formatDbItem(item),
  });
};
