import { Budget } from "../../domain/models/budget";
import { formatDbItem } from "../../utils/format-item";
import { successResponse } from "../../utils/response";
import { sortItemByRecent } from "../../utils/sort-item";
import { DbService } from "../shared/dbService";

export const getBudget = async ({
  dbService,
  userId,
  budgetId,
}: {
  dbService: DbService;
  userId: string;
  budgetId?: string;
}) => {
  const keyConditionExpression = getKeyConditionExpression(budgetId);

  const expressionAttributeValues = getExpressionAttributeValues(
    userId,
    budgetId
  );

  const items = await dbService.queryItems(
    keyConditionExpression,
    expressionAttributeValues
  );

  return formatResponse(items);
};

const formatResponse = (items: Record<string, any>[]) => {
  if (items.length === 0) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: "Budget not found" }),
    };
  }

  const budgets = items.map(formatDbItem);

  return successResponse(sortItemByRecent(budgets as Budget[]));
};

const getKeyConditionExpression = (budgetId?: string): string => {
  if (budgetId) {
    return "PK = :pk AND SK = :sk";
  }
  return "PK = :pk AND begins_with(SK, :skPrefix)";
};

const getExpressionAttributeValues = (
  userId: string,
  budgetId?: string
): Record<string, any> => {
  if (budgetId)
    return {
      ":pk": { S: `USER#${userId}` },
      ":sk": { S: `BUDGET#${budgetId}` },
    };

  return {
    ":pk": { S: `USER#${userId}` },
    ":skPrefix": { S: "BUDGET#" },
  };
};
