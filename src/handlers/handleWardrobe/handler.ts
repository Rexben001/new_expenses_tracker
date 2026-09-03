import type { APIGatewayEvent, Context } from "aws-lambda";
import type { DbService } from "../../services/shared/dbService";
import type { WardrobeImageStore } from "../../services/wardrobe/imageStore";
import {
  createWardrobeItem,
  createWardrobeUploadUrl,
  deleteWardrobeItem,
  getWardrobeItems,
  getWardrobePlan,
  putWardrobePlan,
  updateWardrobeItem,
} from "../../services/wardrobe/wardrobeService";
import { getUserId } from "../../utils/getUserId";
import { HttpError } from "../../utils/http-error";
import { createInvocationLogger } from "../../utils/logger";
import { errorResponseFromError } from "../../utils/response";

export const makeHandler = ({
  dbService,
  imageStore,
}: {
  dbService: DbService;
  imageStore: WardrobeImageStore;
}) => {
  return async (event: APIGatewayEvent, context: Context) => {
    const logger = createInvocationLogger(context, {
      handler: "handleWardrobe",
      path: event.path,
      method: event.httpMethod,
    });

    try {
      const userId = getUserId(event);
      const subAccountId = event.queryStringParameters?.subId;
      const shared = { dbService, imageStore, userId, subAccountId };

      if (
        event.httpMethod === "POST" &&
        event.path.endsWith("/wardrobe/upload-url")
      ) {
        return await createWardrobeUploadUrl({
          body: event.body ?? "",
          imageStore,
          userId,
          subAccountId,
        });
      }

      if (event.path.endsWith("/wardrobe/items")) {
        if (event.httpMethod === "GET") {
          return await getWardrobeItems(shared);
        }
        if (event.httpMethod === "POST") {
          return await createWardrobeItem({
            ...shared,
            body: event.body ?? "",
          });
        }
      }

      const wardrobeItemId = event.pathParameters?.wardrobeItemId;
      if (wardrobeItemId) {
        if (event.httpMethod === "PUT") {
          return await updateWardrobeItem({
            ...shared,
            body: event.body ?? "",
            wardrobeItemId,
          });
        }
        if (event.httpMethod === "DELETE") {
          return await deleteWardrobeItem({ ...shared, wardrobeItemId });
        }
      }

      const weekStart = event.pathParameters?.weekStart;
      if (weekStart) {
        if (event.httpMethod === "GET") {
          return await getWardrobePlan({
            dbService,
            userId,
            subAccountId,
            weekStart,
          });
        }
        if (event.httpMethod === "PUT") {
          return await putWardrobePlan({
            body: event.body ?? "",
            dbService,
            userId,
            subAccountId,
            weekStart,
          });
        }
      }

      throw new HttpError("Method not allowed", 405);
    } catch (error) {
      logger.error("Error handling wardrobe request", { error });
      return errorResponseFromError(error);
    }
  };
};
