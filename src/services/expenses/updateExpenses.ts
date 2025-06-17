import { formatDbItem } from "../../utils/format-item";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";
import { createExpenses } from "./createExpenses";
import { deleteExpenses } from "./deleteExpenses";

export const updateExpenses = async ({
  dbService,
  body,
  userId,
  budgetId,
  expenseId,
}: {
  dbService: DbService;
  body: string;
  userId: string;
  budgetId?: string;
  expenseId?: string;
}) => {
  if (!expenseId) {
    throw new Error("Expense ID is required for updating an expense");
  }

  console.log({
    body,
  });

  const parsedBody = parseEventBody(body ?? "");

  if (parsedBody.isNewExpense) {
    return createNewOne({
      dbService,
      body,
      userId,
      budgetId,
      expenseId,
    });
  }

  const pk = budgetId ? `USER#${userId}#BUDGET#${budgetId}` : `USER#${userId}`;
  const sk = `EXPENSE#${expenseId}`;

  try {
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
      message: "Expense updated successfully",
      item: formatDbItem(item),
    });
  } catch (err) {
    const error = err as Error;
    if (error.name === "ConditionalCheckFailedException") {
      return createNewOne({
        dbService,
        body,
        userId,
        budgetId,
        expenseId,
      });
    }
    throw new Error(error.message);
  }
};

async function createNewOne({
  dbService,
  userId,
  expenseId,
  body,
  budgetId,
}: {
  dbService: DbService;
  body: string;
  userId: string;
  budgetId?: string;
  expenseId?: string;
}) {
  await deleteExpenses({
    dbService,
    userId,
    expenseId,
  });
  return await createExpenses({
    dbService,
    body,
    userId,
    budgetId,
    expenseId,
  });
}

function parseEventBody(body: string) {
  try {
    return JSON.parse(body);
  } catch (error) {
    console.error("Failed to parse request body JSON:", error);
    throw new Error("Invalid JSON in request body");
  }
}
