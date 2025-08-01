import { DbService } from "../shared/dbService";
import { createExpenses } from "./createExpenses";
import { getExpenseItem } from "./getExpenses";

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
  const expenses = await getExpenseItem({
    dbService,
    userId,
    budgetId,
    expenseId,
  });

  if (!expenses.length) throw new Error("No expense");

  const body = JSON.stringify({
    ...expenses[0],
    id: null,
    title: `${expenses[0].title} Copy`,
    updatedAt: new Date().toISOString(),
  });

  return await createExpenses({
    dbService,
    body,
    userId,
    budgetId,
  });
};
