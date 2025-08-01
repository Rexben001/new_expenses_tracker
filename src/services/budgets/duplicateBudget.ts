import { DbService } from "../shared/dbService";
import { createBudgetOnly } from "./createBudget";
import { getBudgetItem } from "./getBudget";
import { getExpenseItem } from "../expenses/getExpenses";
import { createExpenses } from "../expenses/createExpenses";
import { errorResponse, successResponse } from "../../utils/response";
import { formatDbItem } from "../../utils/format-item";

export const duplicateBudget = async ({
  dbService,
  userId,
  budgetId,
  onlyBudget,
}: {
  dbService: DbService;
  userId: string;
  budgetId?: string;
  onlyBudget?: boolean;
}) => {
  const budget = await getBudgetItem({
    dbService,
    userId,
    budgetId,
  });

  if (!budget.length) {
    console.error("No budget");
    return errorResponse();
  }

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

  if (onlyBudget) {
    return successResponse({
      message: "Budget duplicated successfully",
      item: formatDbItem(newBudget),
    });
  }

  const expenses = await getExpenseItem({
    dbService,
    userId,
    budgetId,
  });

  const budgetIdForExpenses = newBudget.id;

  await Promise.all(
    expenses.map((expense) => {
      const newExpenseBody = {
        ...expense,
        id: null,
        title: `${expense.title}`,
        updatedAt: new Date().toISOString(),
        budgetId: budgetIdForExpenses,
        upcoming: true,
      };
      return createExpenses({
        dbService,
        body: JSON.stringify(newExpenseBody),
        userId,
        budgetId: budgetIdForExpenses,
      });
    })
  );

  return successResponse({
    message: "Budget duplicated successfully",
    item: formatDbItem(newBudget),
  });
};
