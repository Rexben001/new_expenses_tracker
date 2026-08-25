import { HttpError } from "./http-error";
import { ZodError } from "zod";

const headers = {
  "Access-Control-Allow-Origin": "*", // or your frontend URL
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,DELETE",
};

export const successResponse = (body: any, statusCode = 200) => {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
};

export const errorResponse = (
  message = "Internal Server Error",
  statusCode = 500,
  details?: unknown
) => {
  return {
    statusCode,
    headers,
    body: JSON.stringify({
      message,
      statusCode,
      ...(details !== undefined ? { details } : {}),
    }),
  };
};

export const errorResponseFromError = (
  error: unknown,
  fallbackMessage = "Internal Server Error"
) => {
  if (error instanceof HttpError) {
    return errorResponse(error.message, error.status, error.details);
  }

  if (error instanceof ZodError) {
    return errorResponse("Invalid request parameters", 400, zodDetails(error));
  }

  if (
    error instanceof Error &&
    error.name === "ConditionalCheckFailedException"
  ) {
    return errorResponse(
      "This record changed during the request. Refresh and try again.",
      409
    );
  }

  return errorResponse(fallbackMessage);
};

const zodDetails = (error: ZodError) =>
  error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
  }));
