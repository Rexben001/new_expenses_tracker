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
        size: event.queryStringParameters?.size,
        length: event.queryStringParameters?.length,
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
        await consumeAttemptLimit(dbService, sourceIp, `photo-upload-${input.kind}`, 10, 300);
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
      if (["details", "cancel", "reschedule"].includes(action)) {
        if (action === "details") {
          await consumeAttemptLimit(dbService, sourceIp, "manage-details", 30, 300);
          return await managePublicBooking({ dbService, userId: bookingUserId, body: event.body ?? "" });
        }
        await consumeAttemptLimit(dbService, sourceIp, "booking-write-attempts", 10, 300);
        await assertNoSuccessCooldown(dbService, sourceIp);
        const response = await managePublicBooking({
          dbService,
          userId: bookingUserId,
          body: event.body ?? "",
        });
        await recordSuccessCooldown(dbService, sourceIp);
        return response;
      }
      await consumeAttemptLimit(dbService, sourceIp, "booking-write-attempts", 10, 300);
      await assertNoSuccessCooldown(dbService, sourceIp);
      const response = await createPublicBooking({
        dbService,
        userId: bookingUserId,
        body: event.body ?? "",
      });
      await recordSuccessCooldown(dbService, sourceIp);
      return response;
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

function rateLimitKey(sourceIp: string) {
  return createHash("sha256").update(sourceIp).digest("hex");
}

async function consumeAttemptLimit(dbService: DbService, sourceIp: string, scope: string, limit: number, windowSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / windowSeconds);
  const key = { PK: `PUBLIC_BOOKING_RATE#${rateLimitKey(sourceIp)}`, SK: `${scope.toUpperCase()}#WINDOW#${window}` };
  if (dbService.consumeRateLimit) {
    try {
      await dbService.consumeRateLimit(key, limit, (window + 1) * windowSeconds + 60);
      return;
    } catch (error) {
      if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
        throw new HttpError("Too many requests. Wait a few minutes and try again.", 429);
      }
      throw error;
    }
  }
  await dbService.putItem({ ...key, expiresAt: (window + 1) * windowSeconds + 60 });
}

async function assertNoSuccessCooldown(dbService: DbService, sourceIp: string) {
  if (!dbService.getItemOrUndefined) return;
  const now = Math.floor(Date.now() / 1000);
  const marker = await dbService.getItemOrUndefined({
    PK: `PUBLIC_BOOKING_RATE#${rateLimitKey(sourceIp)}`,
    SK: "BOOKING_WRITE_SUCCESS",
  });
  if (marker && Number(marker.expiresAt) > now) {
    throw new HttpError("A booking change was already completed. Wait one minute and try again.", 429);
  }
}

async function recordSuccessCooldown(dbService: DbService, sourceIp: string) {
  const ipHash = createHash("sha256").update(sourceIp).digest("hex");
  const now = Math.floor(Date.now() / 1000);
  const key = { PK: `PUBLIC_BOOKING_RATE#${ipHash}`, SK: "BOOKING_WRITE_SUCCESS" };
  if (dbService.consumeRateLimit) {
    await dbService.consumeRateLimit(key, Number.MAX_SAFE_INTEGER, now + 60);
    return;
  }
  try {
    await dbService.putItem({
      ...key,
      expiresAt: now + 60,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      throw new HttpError("A booking change was already completed. Wait one minute and try again.", 429);
    }
    throw error;
  }
}
