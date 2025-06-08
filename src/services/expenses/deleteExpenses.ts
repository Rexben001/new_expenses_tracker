import { DbService } from "../dbService";

export const deleteExpenses = async ({
  dbService,
  userId,
  expenseId,
  budgetId,
}: {
  dbService: DbService;
  userId: string;
  expenseId?: string;
  budgetId?: string;
}) => {
  if (!expenseId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Expense ID is required" }),
    };
  }

  const pk = budgetId ? `USER#${userId}#BUDGET#${budgetId}` : `USER#${userId}`;
  const sk = `EXPENSE#${expenseId}`;
  await dbService.deleteItem({
    PK: pk,
    SK: sk,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Expense deleted successfully" }),
  };
};
