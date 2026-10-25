import type { APIGatewayEvent, Context } from "aws-lambda";
import {
  createPublicBooking,
  getPublicBookingAvailability,
  managePublicBooking,
} from "../../services/calendar/publicBooking";
import type { DbService } from "../../services/shared/dbService";
import { HttpError } from "../../utils/http-error";
import { createInvocationLogger } from "../../utils/logger";
import { errorResponseFromError } from "../../utils/response";
import { createHash } from "node:crypto";

export const makeHandler = ({
  dbService,
  bookingUserId,
}: {
  dbService: DbService;
  bookingUserId: string;
}) => async (event: APIGatewayEvent, context: Context) => {
  const logger = createInvocationLogger(context, {
    handler: "handlePublicBooking",
    path: event.path,
    method: event.httpMethod,
  });

  try {
    if (!bookingUserId) throw new HttpError("Booking calendar is not configured", 503);
    if (event.httpMethod === "GET") {
      return await getPublicBookingAvailability({
        dbService,
        userId: bookingUserId,
        hairStyleId: event.queryStringParameters?.hairStyleId,
      });
    }
    if (event.httpMethod === "POST") {
      assertAllowedOrigin(event);
      const action = (() => {
        try { return JSON.parse(event.body ?? "{}").action; } catch { return undefined; }
      })();
      const sourceIp = event.requestContext.identity?.sourceIp ?? "unknown";
      await enforceRateLimit(
        dbService,
        sourceIp,
        action === "details" ? "manage-details" : "booking-write",
        action === "details" ? 5 : 60,
      );
      if (["details", "cancel", "reschedule"].includes(action)) {
        return await managePublicBooking({
          dbService,
          userId: bookingUserId,
          body: event.body ?? "",
        });
      }
      return await createPublicBooking({
        dbService,
        userId: bookingUserId,
        body: event.body ?? "",
      });
    }
    throw new HttpError("Method not allowed", 405);
  } catch (error) {
    logger.error("Public booking request failed", { error });
    return errorResponseFromError(error);
  }
};

function assertAllowedOrigin(event: APIGatewayEvent) {
  const origin = event.headers?.origin ?? event.headers?.Origin;
  const allowed = (process.env.ALLOWED_BOOKING_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!origin || !allowed.includes(origin)) {
    throw new HttpError("Booking request origin is not allowed", 403);
  }
}

async function enforceRateLimit(dbService: DbService, sourceIp: string, scope: string, windowSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / windowSeconds);
  const ipHash = createHash("sha256").update(sourceIp).digest("hex");
  try {
    await dbService.putItem({
      PK: `PUBLIC_BOOKING_RATE#${ipHash}`,
      SK: `${scope.toUpperCase()}#WINDOW#${window}`,
      expiresAt: now + windowSeconds * 2,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      throw new HttpError(`Too many requests. Wait ${windowSeconds} seconds and try again.`, 429);
    }
    throw error;
  }
}
