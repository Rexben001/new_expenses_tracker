import { randomUUID } from "node:crypto";
import { HttpError } from "../../utils/http-error";
import { DbService } from "../shared/dbService";
import {
  ExpenseRequest,
  ExpenseRequestSchema,
} from "../../domain/models/expense";
import { formatDbItem } from "../../utils/format-item";
import { successResponse } from "../../utils/response";
import { createExpensesPk } from "../../utils/createPk";

export const createExpenses = async ({
  dbService,
  body,
  userId,
  budgetId,
  expenseId,
  subAccountId,
}: {
  dbService: DbService;
  body: string;
  userId: string;
  budgetId?: string;
  expenseId?: string;
  subAccountId?: string;
}) => {
  const _expenseId = expenseId ?? randomUUID();

  const parsedBody = parseEventBody(body ?? "");

  const userPK = `USER#${userId}`;
  const pk = createExpensesPk(userId, budgetId, subAccountId);
  const sk = `EXPENSE#${_expenseId}`;

  console.log({
    pk,
    sk,
    userPK,
    _expenseId,
  });

  const category = parsedBody.category ?? "Others"; // Default category if not provided

  const item = {
    ...parsedBody,
    PK: pk,
    SK: sk,
    gsiPk: userPK,
    gsiSk: sk,
    userId,
    id: _expenseId,
    category,
    updatedAt: parsedBody.updatedAt || new Date().toISOString(),
    budgetId: budgetId ?? undefined,
    subAccountId: subAccountId ?? undefined,
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
