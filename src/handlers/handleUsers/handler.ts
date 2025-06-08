import { APIGatewayEvent, PostConfirmationTriggerEvent } from "aws-lambda";
import { DbService } from "../../services/dbService";
import { createUser } from "../../services/users/createUser";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (event: PostConfirmationTriggerEvent | APIGatewayEvent) => {
    try {
      if (isPostConfirmationEvent(event)) {
        // Handle Post Confirmation Trigger Event
        const userId = event.request.userAttributes.sub;
        const email = event.request.userAttributes.email;

        await createUser({
          dbService,
          userId,
          email,
        });
        return event;
      }
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Invalid event type. Expected PostConfirmationTriggerEvent.",
        }),
      };
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

function isApiGatewayEvent(event: any): event is APIGatewayEvent {
  return event?.httpMethod !== undefined && event?.headers !== undefined;
}

// Check if it's a Cognito PostConfirmation trigger
function isPostConfirmationEvent(
  event: any
): event is PostConfirmationTriggerEvent {
  return (
    event?.triggerSource?.startsWith("PostConfirmation_") &&
    event?.request?.userAttributes !== undefined
  );
}
