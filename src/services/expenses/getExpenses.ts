import { DbService } from "../dbService";

export const getExpenses = async ({
  dbService,
  userId,
  expenseId,
  budgetId,
}: {
  dbService: DbService;
  userId: string;
  expenseId?: string;
  budgetId?: string;
}) => {
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

  // Map items to the expected format
  const expenses = items.map((item) => ({
    id: item.id,
    amount: item.amount,
    description: item.description,
    date: item.date,
    category: item.category,
    updatedAt: item.updatedAt,
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ expenses }),
  };
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
