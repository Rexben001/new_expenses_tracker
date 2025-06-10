import { randomUUID } from "node:crypto";
import { HttpError } from "../../utils/http-error";
import { DbService } from "../dbService";
import {
  ExpenseRequest,
  ExpenseRequestSchema,
} from "../../domain/models/expense";
import { formatDbItem } from "../../utils/format-item";
import { successResponse } from "../../utils/response";

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

  const category = parsedBody.category || "Others"; // Default category if not provided

  const gsiSk = `CATEGORY#${category.toLocaleLowerCase()}`;

  const item = {
    ...parsedBody,
    PK: pk,
    SK: sk,
    gsiPk: pk,
    gsiSk,
    userId,
    id: expenseId,
    category,
    updatedAt: parsedBody.updatedAt || new Date().toISOString(),
  };

  await dbService.putItem(item);
  return successResponse(
    {
      message: "Expense created successfully",
      item: formatDbItem(item),
    },
    201
  );
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
