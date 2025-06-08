import { formatDbItem } from "../../utils/format-item";
import { DbService } from "../dbService";

export const getBudget = async ({
  dbService,
  userId,
  budgetId,
}: {
  dbService: DbService;
  userId: string;
  budgetId?: string;
}) => {
  const keyConditionExpression = budgetId
    ? "PK = :pk AND SK = :sk"
    : "PK = :pk AND begins_with(SK, :skPrefix)";

  const expressionAttributeValues = getExpressionAttributeValues(
    userId,
    budgetId
  );

  const items = await dbService.queryItems(
    keyConditionExpression,
    expressionAttributeValues
  );

  if (items.length === 0) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: "Budget not found" }),
    };
  }

  const budget = items.map(formatDbItem);

  return {
    statusCode: 200,
    body: JSON.stringify({
      budget,
    }),
  };
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
