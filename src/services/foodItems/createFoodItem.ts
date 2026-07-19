import { randomUUID } from "node:crypto";
import {
  FoodItemRequest,
  FoodItemRequestSchema,
} from "../../domain/models/foodItem";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const createFoodItem = async ({
  dbService,
  body,
  userId,
  subAccountId,
}: {
  dbService: DbService;
  body: string;
  userId: string;
  subAccountId?: string;
}) => {
  const parsedBody = parseEventBody(body);
  const id = randomUUID();
  const now = new Date().toISOString();
  const item = {
    ...parsedBody,
    PK: createPk(userId, subAccountId),
    SK: `FOOD_ITEM#${id}`,
    id,
    userId,
    subAccountId: subAccountId ?? undefined,
    expiryDate: parsedBody.expiryDate || undefined,
    location: parsedBody.location || undefined,
    notes: parsedBody.notes || undefined,
    createdAt: now,
    updatedAt: now,
  };

  await dbService.putItem(item);

  return successResponse(
    {
      message: "Food item created successfully",
      item: formatDbItem(item),
    },
    201
  );
};

const parseEventBody = (body: string): FoodItemRequest => {
  try {
    return FoodItemRequestSchema.parse(JSON.parse(body));
  } catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
    });
  }
};
