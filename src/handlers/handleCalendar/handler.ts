import type { APIGatewayEvent, Context } from "aws-lambda";
import { createCalendarEntry } from "../../services/calendar/createCalendarEntry";
import { deleteCalendarEntry } from "../../services/calendar/deleteCalendarEntry";
import { getCalendarEntries } from "../../services/calendar/getCalendarEntries";
import { updateCalendarEntry } from "../../services/calendar/updateCalendarEntry";
import { DbService } from "../../services/shared/dbService";
import { getUserId } from "../../utils/getUserId";
import { HttpError } from "../../utils/http-error";
import { createInvocationLogger } from "../../utils/logger";
import { errorResponseFromError } from "../../utils/response";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (event: APIGatewayEvent, context: Context) => {
    const logger = createInvocationLogger(context, {
      handler: "handleCalendar",
      path: event.path,
      method: event.httpMethod,
    });

    try {
      const eventMethod = event.httpMethod;
      const userId = getUserId(event);
      const calendarEntryId = event.pathParameters?.calendarEntryId;
      const subAccountId = event.queryStringParameters?.subId;
      const body = event.body ?? "";

      logger.info("Received calendar request", {
        calendarEntryId,
        subAccountId,
        hasBody: body.length > 0,
      });

      if (!userId) {
        throw new HttpError("User ID is required", 400, {
          cause: new Error("User ID is missing from path parameters"),
        });
      }

      switch (eventMethod) {
        case "POST":
          return await createCalendarEntry({
            dbService,
            body,
            userId,
            subAccountId,
          });
        case "GET":
          return await getCalendarEntries({
            dbService,
            userId,
            calendarEntryId,
            subAccountId,
          });
        case "PUT":
          return await updateCalendarEntry({
            dbService,
            body,
            userId,
            calendarEntryId,
            subAccountId,
          });
        case "DELETE":
          return await deleteCalendarEntry({
            dbService,
            userId,
            calendarEntryId,
            subAccountId,
          });
        default:
          throw new HttpError("Method not allowed", 405, {
            cause: new Error(`Method ${eventMethod} is not allowed`),
          });
      }
    } catch (error) {
      logger.error("Error handling calendar request", { error });
      return errorResponseFromError(error);
    }
  };
};
