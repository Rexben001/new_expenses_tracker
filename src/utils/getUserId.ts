import { APIGatewayEvent } from "aws-lambda";

export const getUserId = (event: APIGatewayEvent): string => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) {
    throw new Error("User ID not found in request context");
  }
  return userId;
};
