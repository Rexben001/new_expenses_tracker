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
import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const makeHandler = ({
  dbService,
  bookingUserId,
  s3Client,
  bookingImageBucket,
}: {
  dbService: DbService;
  bookingUserId: string;
  s3Client: S3Client;
  bookingImageBucket: string;
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
      if (action === "create-photo-upload") {
        const input = parsePhotoUploadRequest(event.body ?? "");
        await enforceRateLimit(dbService, sourceIp, `photo-upload-${input.kind}`, 5);
        if (!bookingImageBucket) throw new HttpError("Photo uploads are unavailable", 503);
        const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[input.contentType];
        const key = `booking-photos/${input.requestId}/${input.kind}-${randomUUID()}.${extension}`;
        const uploadUrl = await getSignedUrl(s3Client, new PutObjectCommand({
          Bucket: bookingImageBucket,
          Key: key,
          ContentType: input.contentType,
          ContentLength: input.size,
        }), { expiresIn: 300 });
        return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ key, uploadUrl }) };
      }
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

function parsePhotoUploadRequest(body: string) {
  let input: Record<string, any>;
  try { input = JSON.parse(body); } catch { throw new HttpError("Invalid photo upload request", 400); }
  if (!/^[0-9a-f-]{36}$/i.test(input.requestId ?? "") || !["style", "hair"].includes(input.kind)) {
    throw new HttpError("Invalid photo upload request", 400);
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(input.contentType) || !Number.isInteger(input.size) || input.size < 1 || input.size > 2 * 1024 * 1024) {
    throw new HttpError("Photos must be JPG, PNG, or WebP and no larger than 2 MB", 400);
  }
  if (typeof input.fileName !== "string" || !input.fileName.trim() || input.fileName.length > 150) {
    throw new HttpError("Invalid photo filename", 400);
  }
  return input as { requestId: string; kind: "style" | "hair"; contentType: "image/jpeg" | "image/png" | "image/webp"; size: number; fileName: string };
}

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
