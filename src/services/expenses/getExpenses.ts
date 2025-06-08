import { formatDbItem } from "../../utils/format-item";
import { DbService } from "../dbService";

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
  const keyConditionExpression = getKeyConditionExpression(
    budgetId,
    expenseId,
    category
  );

  const expressionAttributeValues = getExpressionAttributeValues(
    userId,
    budgetId,
    expenseId,
    category
  );
  const gsiFields = category
    ? {
        indexName: "CategoryIndex",
        expressionAttributeNames: { "#category": "category" },
      }
    : undefined;
  const items = await dbService.queryItems(
    keyConditionExpression,
    expressionAttributeValues,
    gsiFields
  );

  if (items.length === 0) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: "No expenses found" }),
    };
  }

  // Map items to the expected format
  const expenses = items.map(formatDbItem);

  return {
    statusCode: 200,
    body: JSON.stringify({ expenses }),
  };
};

const getExpressionAttributeValues = (
  userId: string,
  budgetId?: string,
  expenseId?: string,
  category?: string
): Record<string, any> => {
  if (budgetId && expenseId)
    return {
      ":pk": { S: `USER#${userId}#BUDGET#${budgetId}` },
      ":sk": { S: `EXPENSE#${expenseId}` },
      ...(category && { ":category": { S: category } }),
    };

  if (budgetId) {
    return {
      ":pk": { S: `USER#${userId}#BUDGET#${budgetId}` },
      ":skPrefix": { S: "EXPENSE#" },
      ...(category && { ":category": { S: category } }),
    };
  }

  if (expenseId) {
    return {
      ":pk": { S: `USER#${userId}` },
      ":sk": { S: `EXPENSE#${expenseId}` },
      ...(category && { ":category": { S: category } }),
    };
  }

  return {
    ":pk": { S: `USER#${userId}` },
    ":skPrefix": { S: "EXPENSE#" },
    ...(category && { ":category": { S: category } }),
  };
};

const getKeyConditionExpression = (
  budgetId?: string,
  expenseId?: string,
  category?: string
): string => {
  const categoryCondition = category ? " AND #category = :category" : "";

  if (expenseId) {
    return "PK = :pk AND SK = :sk" + categoryCondition;
  }

  if (budgetId) {
    return "PK = :pk AND begins_with(SK, :skPrefix)" + categoryCondition;
  }

  return "PK = :pk AND begins_with(SK, :skPrefix)" + categoryCondition;
};
