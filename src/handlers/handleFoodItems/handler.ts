import type { APIGatewayEvent, Context } from "aws-lambda";
import { createFoodItem } from "../../services/foodItems/createFoodItem";
import { deleteFoodItem } from "../../services/foodItems/deleteFoodItem";
import { getFoodItems } from "../../services/foodItems/getFoodItems";
import { getFoodStats } from "../../services/foodItems/getFoodStats";
import { updateFoodItem } from "../../services/foodItems/updateFoodItem";
import { DbService } from "../../services/shared/dbService";
import { getUserId } from "../../utils/getUserId";
import { HttpError } from "../../utils/http-error";
import { createInvocationLogger } from "../../utils/logger";
import { errorResponseFromError } from "../../utils/response";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (event: APIGatewayEvent, context: Context) => {
    const logger = createInvocationLogger(context, {
      handler: "handleFoodItems",
      path: event.path,
      method: event.httpMethod,
    });

    try {
      const userId = getUserId(event);
      if (!userId) throw new HttpError("User ID is required", 400);

      const params = {
        dbService,
        userId,
        foodItemId: event.pathParameters?.foodItemId,
        subAccountId: event.queryStringParameters?.subId,
      };

      switch (event.httpMethod) {
        case "POST":
          return await createFoodItem({ ...params, body: event.body ?? "" });
        case "GET":
          if (event.path.endsWith("/stats")) {
            return await getFoodStats(params);
          }
          return await getFoodItems(params);
        case "PUT":
          return await updateFoodItem({ ...params, body: event.body ?? "" });
        case "DELETE":
          return await deleteFoodItem(params);
        default:
          throw new HttpError("Method not allowed", 405);
      }
    } catch (error) {
      logger.error("Error handling food item request", { error });
      return errorResponseFromError(error);
    }
  };
};
