import type { APIGatewayEvent, Context } from "aws-lambda";
import { clearSchedule, createMeal, deleteMeal, getMealPlan, setSchedule } from "../../services/mealPlans/mealPlanService";
import { DbService } from "../../services/shared/dbService";
import { getUserId } from "../../utils/getUserId";
import { HttpError } from "../../utils/http-error";
import { createInvocationLogger } from "../../utils/logger";
import { errorResponseFromError } from "../../utils/response";

export const makeHandler = ({ planDb, inventoryDb }: { planDb: DbService; inventoryDb: DbService }) => async (event: APIGatewayEvent, context: Context) => {
  const logger = createInvocationLogger(context, { handler: "handleMealPlans", path: event.path, method: event.httpMethod });
  try {
    const params = { planDb, inventoryDb, userId: getUserId(event), subAccountId: event.queryStringParameters?.subId };
    if (event.path.includes("/schedule/")) {
      // Accept the former `{day}` API Gateway parameter during rolling deploys.
      // Its value is now an ISO date even when the deployed resource name is stale.
      const slot = {
        ...params,
        date: event.pathParameters?.date ?? event.pathParameters?.day,
        mealType: event.pathParameters?.mealType,
      };
      if (event.httpMethod === "PUT") return await setSchedule({ ...slot, body: event.body ?? "" });
      if (event.httpMethod === "DELETE") return await clearSchedule(slot);
    }
    if (event.path.endsWith("/meals") && event.httpMethod === "POST") return await createMeal({ ...params, body: event.body ?? "" });
    if (event.pathParameters?.mealId && event.httpMethod === "DELETE") return await deleteMeal({ ...params, mealId: event.pathParameters.mealId });
    if (event.httpMethod === "GET") return await getMealPlan(params);
    throw new HttpError("Method not allowed", 405);
  } catch (error) { logger.error("Error handling meal plan request", { error }); return errorResponseFromError(error); }
};
