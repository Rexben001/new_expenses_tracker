import type { APIGatewayEvent, Context } from "aws-lambda";
import { createShoppingItem, deleteShoppingItem, getShoppingItems, updateShoppingItem } from "../../services/shopping/shoppingService";
import { DbService } from "../../services/shared/dbService";
import { getUserId } from "../../utils/getUserId";
import { HttpError } from "../../utils/http-error";
import { createInvocationLogger } from "../../utils/logger";
import { errorResponseFromError } from "../../utils/response";

export const makeHandler = ({ shoppingDb, inventoryDb }: { shoppingDb: DbService; inventoryDb: DbService }) => async (event: APIGatewayEvent, context: Context) => {
  const logger = createInvocationLogger(context, { handler: "handleShopping", path: event.path, method: event.httpMethod });
  try {
    const params = { shoppingDb, inventoryDb, userId: getUserId(event), subAccountId: event.queryStringParameters?.subId, shoppingItemId: event.pathParameters?.shoppingItemId };
    if (event.httpMethod === "GET") return await getShoppingItems(params);
    if (event.httpMethod === "POST") return await createShoppingItem({ ...params, body: event.body ?? "" });
    if (event.httpMethod === "PUT") return await updateShoppingItem({ ...params, body: event.body ?? "" });
    if (event.httpMethod === "DELETE") return await deleteShoppingItem(params);
    throw new HttpError("Method not allowed", 405);
  } catch (error) { logger.error("Error handling shopping request", { error }); return errorResponseFromError(error); }
};
