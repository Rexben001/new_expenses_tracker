import { randomUUID } from "node:crypto";
import { DbService } from "../shared/dbService";
import { createExpenses } from "./createExpenses";
import { getExpenses } from "./getExpenses";

export const duplicateExpenses = async ({
  dbService,
  userId,
  budgetId,
  expenseId,
}: {
  dbService: DbService;
  userId: string;
  budgetId?: string;
  expenseId?: string;
}) => {
  const _expenseId = expenseId ?? randomUUID();

  const expense = await getExpenses({
    dbService,
    userId,
    budgetId,
    expenseId,
  });

  const body = JSON.stringify({
    ...expense,
    id: null,
    updatedAt: new Date().toISOString(),
  });

  return await createExpenses({
    dbService,
    body,
    userId,
    budgetId,
  });
};
