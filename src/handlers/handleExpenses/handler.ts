import type { APIGatewayEvent } from "aws-lambda";
import { DbService } from "../../services/shared/dbService";
import { HttpError } from "../../utils/http-error";
import { createExpenses } from "../../services/expenses/createExpenses";
import { getExpenses } from "../../services/expenses/getExpenses";
import { updateExpenses } from "../../services/expenses/updateExpenses";
import { deleteExpenses } from "../../services/expenses/deleteExpenses";
import { getUserId } from "../../utils/getUserId";
import { errorResponse } from "../../utils/response";
import { duplicateExpenses } from "../../services/expenses/duplicateExpense";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (event: APIGatewayEvent) => {
    try {
      const eventMethod = event.httpMethod;
      const userId = getUserId(event);
      const budgetId = event.queryStringParameters?.budgetId;
      const expenseId = event.pathParameters?.expenseId;
      const subAccountId = event.queryStringParameters?.subId;

      if (!userId) {
        throw new HttpError("User ID is required", 400, {
          cause: new Error("User ID is missing from path parameters"),
        });
      }

      if (event.path.includes("duplicates")) {
        return duplicateExpenses({
          dbService,
          userId,
          budgetId,
          expenseId,
          subAccountId,
        });
      }

      switch (eventMethod) {
        case "POST":
          return await createExpenses({
            dbService,
            body: event.body ?? "",
            userId,
            budgetId,
            subAccountId,
          });
        case "GET":
          return await getExpenses({
            dbService,
            userId,
            expenseId,
            budgetId,
            subAccountId,
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
            subAccountId,
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
            subAccountId,
          });
        default:
          throw new HttpError("Method not allowed", 405, {
            cause: new Error(`Method ${eventMethod} is not allowed`),
          });
      }
    } catch (error) {
      console.error("Error handling expenses:", error);
      return errorResponse();
    }
  };
};
