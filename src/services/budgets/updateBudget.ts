import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const updateBudgets = async ({
  dbService,
  body,
  userId,
  budgetId,
  subAccountId,
}: {
  dbService: DbService;
  body: string;
  userId: string;
  budgetId?: string;
  subAccountId?: string;
}) => {
  if (!budgetId) {
    throw new Error("Budget ID is required for updating a budget");
  }

  const parsedBody = parseEventBody(body ?? "");

  const pk = createPk(userId, subAccountId);
  const sk = `BUDGET#${budgetId}`;

  const updateExpression = Object.keys(parsedBody)
    .map((key) => `#${key} = :${key}`)
    .join(", ");

  const expressionAttributeNames = Object.keys(parsedBody).reduce(
    (acc, key) => ({ ...acc, [`#${key}`]: key }),
    {}
  );

  const expressionAttributeValues = Object.keys(parsedBody).reduce(
    (acc, key) => ({ ...acc, [`:${key}`]: parsedBody[key] }),
    {}
  );

  const item = await dbService.updateItem(
    { PK: pk, SK: sk },
    `SET ${updateExpression}`,
    expressionAttributeNames,
    expressionAttributeValues
  );

  return successResponse({
    message: "Budget updated successfully",
    item: formatDbItem(item),
  });
};

function parseEventBody(body: string) {
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error("Invalid JSON in request body");
  }
}
