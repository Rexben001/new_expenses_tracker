import { APIGatewayEvent, PostConfirmationTriggerEvent } from "aws-lambda";
import { DbService } from "../../services/shared/dbService";
import { createSubAccount, createUser } from "../../services/users/createUser";
import { getUser } from "../../services/users/getUser";
import { getUserId } from "../../utils/getUserId";
import { HttpError } from "../../utils/http-error";
import { updateUser } from "../../services/users/updateUser";
import { deleteSubAccount } from "../../services/users/deleteSubAccount";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (event: PostConfirmationTriggerEvent | APIGatewayEvent) => {
    try {
      if (isPostConfirmationEvent(event)) {
        // Handle Post Confirmation Trigger Event
        const userId = event.request.userAttributes.sub;
        const email = event.request.userAttributes.email;

        if (event?.triggerSource === "PostConfirmation_ConfirmSignUp") {
          await createUser({
            dbService,
            userId,
            email,
          });
        }
        return event;
      } else {
        const eventMethod = event.httpMethod;
        const userId = getUserId(event);

        const subAccountId = event.queryStringParameters?.subId;

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
      console.error("Error in handler:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Internal Server Error",
          error: error instanceof Error ? error.message : String(error),
        }),
      };
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
