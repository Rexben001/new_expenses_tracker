import { formatDbItem } from "../../utils/format-item";
import { errorResponse, successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const getExpenses = async ({
  dbService,
  userId,
  expenseId,
  budgetId,
  category,
}: {
  dbService: DbService;
  userId: string;
  expenseId?: string;
  budgetId?: string;
  category?: string;
}) => {
  if (!expenseId && category) {
    const indexName = "UserCategoryIndex";

    const items = await dbService.queryItems(
      "gsiPk = :user AND begins_with(gsiSk, :category)",
      {
        ":user": { S: `USER#${userId}` },
        ":category": { S: `CATEGORY#${category.toLocaleLowerCase()}` },
      },
      indexName
    );
    return formatResponse(items);
  }
  const keyConditionExpression = getKeyConditionExpression(budgetId, expenseId);

  const expressionAttributeValues = getExpressionAttributeValues(
    userId,
    budgetId,
    expenseId
  );

  const items = await dbService.queryItems(
    keyConditionExpression,
    expressionAttributeValues
  );

  return formatResponse(items);
};

const formatResponse = (items: Record<string, any>[]) => {
  if (items.length === 0) {
    return errorResponse("No expenses found for the given criteria", 404);
  }

  const expenses = items.map(formatDbItem);

  return successResponse(expenses);
};

const getExpressionAttributeValues = (
  userId: string,
  budgetId?: string,
  expenseId?: string
): Record<string, any> => {
  if (budgetId && expenseId)
    return {
      ":pk": { S: `USER#${userId}#BUDGET#${budgetId}` },
      ":sk": { S: `EXPENSE#${expenseId}` },
    };

  if (budgetId) {
    return {
      ":pk": { S: `USER#${userId}#BUDGET#${budgetId}` },
      ":skPrefix": { S: "EXPENSE#" },
    };
  }

  if (expenseId) {
    return {
      ":pk": { S: `USER#${userId}` },
      ":sk": { S: `EXPENSE#${expenseId}` },
    };
  }

  return {
    ":pk": { S: `USER#${userId}` },
    ":skPrefix": { S: "EXPENSE#" },
  };
};

const getKeyConditionExpression = (
  budgetId?: string,
  expenseId?: string
): string => {
  if (expenseId) {
    return "PK = :pk AND SK = :sk";
  }

  if (budgetId) {
    return "PK = :pk AND begins_with(SK, :skPrefix)";
  }

  return "PK = :pk AND begins_with(SK, :skPrefix)";
};
