import type { APIGatewayEvent } from "aws-lambda";
import { DbService } from "../../services/dbService";
import { HttpError } from "../../utils/http-error";
import { createBudget } from "../../services/budgets/createBudget";
import { getBudget } from "../../services/budgets/getBudget";
import { updateBudgets } from "../../services/budgets/updateBudget";
import { deleteBudget } from "../../services/budgets/deleteBudget";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (event: APIGatewayEvent) => {
    try {
      const eventMethod = event.httpMethod;
      const userId = event.pathParameters?.userId;
      const budgetId = event.pathParameters?.budgetId;
      const body = event.body ?? "";

      if (!userId) {
        throw new HttpError("User ID is required", 400, {
          cause: new Error("User ID is missing from path parameters"),
        });
      }

      switch (eventMethod) {
        case "POST":
          return await createBudget({
            dbService,
            body,
            userId,
          });
        case "GET":
          return await getBudget({
            dbService,
            userId,
            budgetId,
          });
        case "PUT":
          return await updateBudgets({
            dbService,
            body,
            userId,
            budgetId,
          });
        case "DELETE":
          return await deleteBudget({
            dbService,
            userId,
            budgetId,
          });
        default:
          throw new HttpError("Method not allowed", 405, {
            cause: new Error(`Method ${eventMethod} is not allowed`),
          });
      }
    } catch (error) {
      console.error("Error creating budget:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Internal server error" }),
      };
    }
  };
};
