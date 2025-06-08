import { formatDbItem } from "../../utils/format-item";
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

  console.log({
    keyConditionExpression,
    expressionAttributeValues,
    userId,
    budgetId,
    expenseId,
  });

  const items = await dbService.queryItems(
    keyConditionExpression,
    expressionAttributeValues
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
