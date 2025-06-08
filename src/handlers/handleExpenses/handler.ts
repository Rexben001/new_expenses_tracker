import type { APIGatewayEvent } from "aws-lambda";
import { DbService } from "../../services/dbService";
import { HttpError } from "../../utils/http-error";
import { createExpenses } from "../../services/expenses/createExpenses";
import { getExpenses } from "../../services/expenses/getExpenses";
import { updateExpenses } from "../../services/expenses/updateExpenses";
import { deleteExpenses } from "../../services/expenses/deleteExpenses";
import { getUserId } from "../../utils/getUserId";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (event: APIGatewayEvent) => {
    try {
      const eventMethod = event.httpMethod;
      const userId = getUserId(event);
      const budgetId = event.queryStringParameters?.budgetId;
      const expenseId = event.pathParameters?.expenseId;

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
            userId,
            budgetId,
          });
        case "GET":
          return await getExpenses({
            dbService,
            userId,
            expenseId,
            budgetId,
          });

        case "PUT":
          if (!event.pathParameters?.expenseId) {
            throw new HttpError("Expense ID is required for updating", 400, {
              cause: new Error("Expense ID is missing from path parameters"),
            });
          }
          return await updateExpenses({
            dbService,
            body: event.body ?? "",
            userId,
            budgetId,
            expenseId,
          });
        case "DELETE":
          if (!event.pathParameters?.expenseId) {
            throw new HttpError("Expense ID is required for deletion", 400, {
              cause: new Error("Expense ID is missing from path parameters"),
            });
          }
          return await deleteExpenses({
            dbService,
            userId,
            expenseId,
            budgetId,
          });
        default:
          throw new HttpError("Method not allowed", 405, {
            cause: new Error(`Method ${eventMethod} is not allowed`),
          });
      }
    } catch (error) {
      console.error("Error handling expenses:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Internal server error" }),
      };
    }
  };
};
