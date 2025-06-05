import type { APIGatewayEvent } from "aws-lambda";
import { DbService } from "../../services/dbService";
import { HttpError } from "../../utils/http-error";
import { randomUUID } from "crypto";
import { BudgetRequest, BudgetRequestSchema } from "../../domain/models/budget";
import { createExpenses } from "../../services/expenses/createExpenses";
import { getExpenses } from "../../services/expenses/getExpenses";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (event: APIGatewayEvent) => {
    try {
      const eventMethod = event.httpMethod;
      const userId = event.pathParameters?.userId;

      if (!userId) {
        throw new HttpError("User ID is required", 400, {
          cause: new Error("User ID is missing from path parameters"),
        });
      }

      switch (eventMethod) {
        case "POST":
          return await createExpenses({
            dbService,
            body: event.body ?? "",
            userId: userId ?? "",
            budgetId: event.pathParameters?.budgetId,
          });
        case "GET":
          return await getExpenses({
            dbService,
            userId: userId ?? "",
            expenseId: event.pathParameters?.expenseId,
            budgetId: event.pathParameters?.budgetId,
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
