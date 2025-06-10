import { successResponse } from "../../utils/response";
import { DbService } from "../dbService";

export const deleteBudget = async ({
  dbService,
  userId,
  budgetId,
}: {
  dbService: DbService;
  userId: string;
  budgetId?: string;
}) => {
  if (!budgetId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Budget ID is required" }),
    };
  }

  const pk = `USER#${userId}`;
  const sk = `BUDGET#${budgetId}`;

  // Delete the budget item
  await dbService.deleteItem({
    PK: pk,
    SK: sk,
  });

  // Optionally, delete associated expenses if needed
  //   await dbService.deleteItemsByPrefix(`${pk}#BUDGET#${budgetId}#EXPENSE#`);

  return successResponse({
    message: "Budget deleted successfully",
  });
};
