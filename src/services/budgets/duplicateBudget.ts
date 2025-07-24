import { DbService } from "../shared/dbService";
import { createBudget, createBudgetOnly } from "./createBudget";
import { getBudgetItem } from "./getBudget";
import { getExpenseItem } from "../expenses/getExpenses";
import { createExpenses } from "../expenses/createExpenses";

export const duplicateBudget = async ({
  dbService,
  userId,
  budgetId,
}: {
  dbService: DbService;
  userId: string;
  budgetId?: string;
}) => {
  const budget = await getBudgetItem({
    dbService,
    userId,
    budgetId,
  });

  if (!budget.length) throw new Error("No expense");

  const body = JSON.stringify({
    ...budget[0],
    id: null,
    title: `${budget[0].title} Copy`,
    updatedAt: new Date().toISOString(),
    period: "monthly",
    category: budget[0].category || "Others", // Default category if not provided
    userId,
  });

  const newBudget = await createBudgetOnly({
    dbService,
    body,
    userId,
  });

  const expenses = await getExpenseItem({
    dbService,
    userId,
    budgetId,
  });

  const budgetIdForExpenses = newBudget.id;

  console.log({
    expenses,
    budgetIdForExpenses,
    userId,
  });

  await Promise.all(
    expenses.map((expense) => {
      const newExpenseBody = {
        ...expense,
        id: null,
        title: `${expense.title}`,
        updatedAt: new Date().toISOString(),
        budgetId: budgetIdForExpenses,
      };
      return createExpenses({
        dbService,
        body: JSON.stringify(newExpenseBody),
        userId,
        budgetId: budgetIdForExpenses,
      });
    })
  );

  return newBudget;
};
