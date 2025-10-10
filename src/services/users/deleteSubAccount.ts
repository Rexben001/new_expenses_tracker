import { Budget } from "../../domain/models/budget";
import { errorResponse, successResponse } from "../../utils/response";
import { deleteExpensesByBudget } from "../budgets/deleteBudget";
import { getBudgetItem } from "../budgets/getBudget";
import { DbService } from "../shared/dbService";

export const deleteSubAccount = async ({
  dbService,
  userId,
  subAccountId,
}: {
  dbService: DbService;
  userId: string;
  subAccountId?: string;
}) => {
  if (!userId || !subAccountId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "User ID and Sub-Account ID are required",
      }),
    };
  }

  await dbService.deleteItem({
    PK: `USER#${userId}`,
    SK: `SUB#${subAccountId}`,
  });

  const budgets: Budget[] = await getBudgetItem({
    dbService,
    userId,
    subAccountId,
  });

  if (budgets.length === 0) {
    return successResponse({
      message: "Sub-account deleted successfully",
    });
  }

  await Promise.all(
    budgets.map(async (budget: Budget) => {
      const budgetId = budget.id;
      if (budgetId) {
        await deleteExpensesByBudget({
          dbService,
          userId,
          budgetId,
          subAccountId,
        });
      }
    })
  );

  return successResponse({
    message: "Sub-account and associated data deleted successfully",
  });
};
