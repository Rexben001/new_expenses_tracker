import { Budget } from "../../domain/models/budget";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { successResponse } from "../../utils/response";
import { sortItemByRecent } from "../../utils/sort-item";
import { DbService } from "../shared/dbService";

type GetBudget = {
  dbService: DbService;
  userId: string;
  budgetId?: string;
  subAccountId?: string;
};

export async function getBudgetItem({
  dbService,
  userId,
  budgetId,
  subAccountId,
}: GetBudget) {
  const keyConditionExpression = getKeyConditionExpression(budgetId);

  const expressionAttributeValues = getExpressionAttributeValues(
    userId,
    budgetId,
    subAccountId
  );

  const items = await dbService.queryItems(
    keyConditionExpression,
    expressionAttributeValues
  );

  return items;
}

export const getBudget = async ({
  dbService,
  userId,
  budgetId,
  subAccountId,
}: {
  dbService: DbService;
  userId: string;
  budgetId?: string;
  subAccountId?: string;
}) => {
  const items = await getBudgetItem({
    dbService,
    userId,
    budgetId,
    subAccountId,
  });

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
  budgetId?: string,
  subAccountId?: string
): Record<string, any> => {
  if (budgetId)
    return {
      ":pk": { S: createPk(userId, subAccountId) },
      ":sk": { S: `BUDGET#${budgetId}` },
    };

  return {
    ":pk": { S: createPk(userId, subAccountId) },
    ":skPrefix": { S: "BUDGET#" },
  };
};
