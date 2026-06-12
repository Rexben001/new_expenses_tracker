import type { APIGatewayEvent, Context } from "aws-lambda";
import { DbService } from "../../services/shared/dbService";
import { HttpError } from "../../utils/http-error";
import { createBudget } from "../../services/budgets/createBudget";
import { getBudget } from "../../services/budgets/getBudget";
import { updateBudgets } from "../../services/budgets/updateBudget";
import { deleteBudget } from "../../services/budgets/deleteBudget";
import { getUserId } from "../../utils/getUserId";
import { errorResponseFromError } from "../../utils/response";
import { duplicateBudget } from "../../services/budgets/duplicateBudget";
import { createInvocationLogger } from "../../utils/logger";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (event: APIGatewayEvent, context: Context) => {
    const logger = createInvocationLogger(context, {
      handler: "handleBudget",
      path: event.path,
      method: event.httpMethod,
    });

    try {
      const eventMethod = event.httpMethod;
      const userId = getUserId(event);
      const budgetId = event.pathParameters?.budgetId;
      const body = event.body ?? "";
      const onlyBudget = event.queryStringParameters?.only === "true";
      const subAccountId = event.queryStringParameters?.subId;
      const setIsRecurring = event.queryStringParameters?.setIsRecurring;

      logger.info("Received budget request", {
        budgetId,
        subAccountId,
        onlyBudget,
        hasBody: body.length > 0,
        isDuplicateRoute: event.path.includes("duplicates"),
      });

      if (!userId) {
        throw new HttpError("User ID is required", 400, {
          cause: new Error("User ID is missing from path parameters"),
        });
      }

      if (event.path.includes("duplicates")) {
        return await duplicateBudget({
          dbService,
          userId,
          budgetId,
          onlyBudget,
          subAccountId,
        });
      }

      switch (eventMethod) {
        case "POST":
          return await createBudget({
            dbService,
            body,
            userId,
            subAccountId,
          });
        case "GET":
          return await getBudget({
            dbService,
            userId,
            budgetId,
            subAccountId,
          });
        case "PUT":
          return await updateBudgets({
            dbService,
            body,
            userId,
            budgetId,
            subAccountId,
            setIsRecurring,
          });
        case "DELETE":
          return await deleteBudget({
            dbService,
            userId,
            budgetId,
            subAccountId,
          });
        default:
          throw new HttpError("Method not allowed", 405, {
            cause: new Error(`Method ${eventMethod} is not allowed`),
          });
      }
    } catch (error) {
      logger.error("Error handling budget request", { error });
      return errorResponseFromError(error);
    }
  };
};
