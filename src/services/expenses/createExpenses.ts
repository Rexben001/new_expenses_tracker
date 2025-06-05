import { randomUUID } from "node:crypto";
import { HttpError } from "../../utils/http-error";
import { DbService } from "../dbService";
import {
  ExpenseRequest,
  ExpenseRequestSchema,
} from "../../domain/models/expense";

export const createExpenses = async ({
  dbService,
  body,
  userId,
  budgetId,
}: {
  dbService: DbService;
  body: string;
  userId: string;
  budgetId?: string;
}) => {
  const expenseId = randomUUID();

  const parsedBody = parseEventBody(body ?? "");

  const pk = budgetId ? `USER#${userId}#BUDGET#${budgetId}` : `USER#${userId}`;
  const sk = `EXPENSE#${expenseId}`;

  const item = {
    ...parsedBody,
    PK: pk,
    SK: sk,
    userId,
    id: expenseId,
    updatedAt: new Date().toISOString(),
  };

  await dbService.putItem(item);
  return {
    statusCode: 201,
    body: JSON.stringify({ message: "Expense created successfully", item }),
  };
};

const parseEventBody = (body: string): ExpenseRequest => {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    return ExpenseRequestSchema.parse({ ...json });
  } catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
    });
  }
};
