import {
  APIGatewayEvent,
  Context,
  PostConfirmationTriggerEvent,
} from "aws-lambda";
import { DbService } from "../../services/shared/dbService";
import { createSubAccount, createUser } from "../../services/users/createUser";
import { getUser } from "../../services/users/getUser";
import { getUserId } from "../../utils/getUserId";
import { HttpError } from "../../utils/http-error";
import { updateUser } from "../../services/users/updateUser";
import { deleteSubAccount } from "../../services/users/deleteSubAccount";
import { createInvocationLogger } from "../../utils/logger";
import { errorResponseFromError } from "../../utils/response";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (
    event: PostConfirmationTriggerEvent | APIGatewayEvent,
    context: Context
  ) => {
    const logger = createInvocationLogger(context, {
      handler: "handleUsers",
    });

    try {
      if (isPostConfirmationEvent(event)) {
        logger.appendKeys({
          triggerSource: event.triggerSource,
        });

        const userId = event.request.userAttributes.sub;
        const email = event.request.userAttributes.email;

        if (event?.triggerSource === "PostConfirmation_ConfirmSignUp") {
          logger.info("Creating user from Cognito post-confirmation trigger", {
            userId,
          });
          await createUser({
            dbService,
            userId,
            email,
          });
        }

        logger.resetKeys();
        return event;
      } else {
        const eventMethod = event.httpMethod;
        const userId = getUserId(event);
        const subAccountId = event.queryStringParameters?.subId;

        logger.appendKeys({
          path: event.path,
          method: eventMethod,
        });

        logger.info("Received user request", {
          userId,
          subAccountId,
          hasBody: Boolean(event.body),
        });

        switch (eventMethod) {
          case "GET":
            return getUser({ dbService, userId, subAccountId });

          case "PUT":
            return updateUser({
              dbService,
              body: event.body ?? "",
              userId,
              subAccountId,
            });

          case "POST":
            return createSubAccount({
              dbService,
              userId,
            });

          case "DELETE":
            return deleteSubAccount({
              dbService,
              userId,
              subAccountId,
            });

          default:
            throw new HttpError("Method not allowed", 405, {
              cause: new Error(`Method ${eventMethod} is not allowed`),
            });
        }
      }
    } catch (error) {
      logger.error("Error handling users request", { error });
      return errorResponseFromError(error);
    }
  };
};

// Check if it's a Cognito PostConfirmation trigger
function isPostConfirmationEvent(
  event: any
): event is PostConfirmationTriggerEvent {
  return (
    event?.triggerSource?.startsWith("PostConfirmation_") &&
    event?.request?.userAttributes !== undefined
  );
}
