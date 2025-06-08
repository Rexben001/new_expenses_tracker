import { formatDbItem } from "../../utils/format-item";
import { DbService } from "../dbService";

export const getBudget = async ({
  dbService,
  userId,
  budgetId,
  category,
}: {
  dbService: DbService;
  userId: string;
  budgetId?: string;
  category?: string;
}) => {
  const keyConditionExpression = getKeyConditionExpression(budgetId, category);

  const expressionAttributeValues = getExpressionAttributeValues(
    userId,
    budgetId,
    category
  );

  const gsiFields = category
    ? { indexName: "CategoryIndex", "#category": "category" }
    : undefined;

  const items = await dbService.queryItems(
    keyConditionExpression,
    expressionAttributeValues,
    gsiFields
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

const getKeyConditionExpression = (
  budgetId?: string,
  category?: string
): string => {
  const categoryCondition = category ? " AND #category = :category" : "";
  if (budgetId) {
    return "PK = :pk AND SK = :sk" + categoryCondition;
  }
  return "PK = :pk AND begins_with(SK, :skPrefix)" + categoryCondition;
};

const getExpressionAttributeValues = (
  userId: string,
  budgetId?: string,
  category?: string
): Record<string, any> => {
  if (budgetId)
    return {
      ":pk": { S: `USER#${userId}` },
      ":sk": { S: `BUDGET#${budgetId}` },
      ...(category && { ":category": { S: category } }),
    };

  return {
    ":pk": { S: `USER#${userId}` },
    ":skPrefix": { S: "BUDGET#" },
    ...(category && { ":category": { S: category } }),
  };
};
