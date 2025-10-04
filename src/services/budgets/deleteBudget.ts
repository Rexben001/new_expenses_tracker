import { createPk } from "../../utils/createPk";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const deleteBudget = async ({
  dbService,
  userId,
  budgetId,
  subAccountId,
}: {
  dbService: DbService;
  userId: string;
  budgetId?: string;
  subAccountId?: string;
}) => {
  if (!budgetId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Budget ID is required" }),
    };
  }

  const pk = createPk(userId, subAccountId);
  const sk = `BUDGET#${budgetId}`;

  // Delete the budget item
  await dbService.deleteItem({
    PK: pk,
    SK: sk,
  });

  await dbService.deleteItemsByPrefix(`${pk}#BUDGET#${budgetId}`, `EXPENSE#`);

  // Optionally, delete associated expenses if needed
  //   await dbService.deleteItemsByPrefix(`${pk}#BUDGET#${budgetId}#EXPENSE#`);

  return successResponse({
    message: "Budget deleted successfully",
  });
};
