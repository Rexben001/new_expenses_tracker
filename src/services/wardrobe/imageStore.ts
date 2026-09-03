import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HttpError } from "../../utils/http-error";

export const WARDROBE_IMAGE_CONTENT_TYPE = "image/png" as const;
export const MAX_WARDROBE_IMAGE_BYTES = 10 * 1024 * 1024;

export type WardrobeUploadUrl = {
  itemId: string;
  imageKey: string;
  uploadUrl: string;
  expiresIn: number;
  contentType: typeof WARDROBE_IMAGE_CONTENT_TYPE;
};

export interface WardrobeImageStore {
  createUploadUrl(input: {
    userId: string;
    scope: string;
  }): Promise<WardrobeUploadUrl>;
  assertImageReady(imageKey: string): Promise<void>;
  createImageUrl(imageKey: string): Promise<string>;
  deleteImage(imageKey: string): Promise<void>;
}

export function wardrobeImageKey({
  userId,
  scope,
  itemId,
}: {
  userId: string;
  scope: string;
  itemId: string;
}) {
  return `users/${userId}/${scope}/${itemId}.png`;
}

export function makeWardrobeImageStore({
  bucketName,
  expiresIn = 900,
  s3Client,
}: {
  bucketName: string;
  expiresIn?: number;
  s3Client: S3Client;
}): WardrobeImageStore {
  const urlExpiresIn = normalizeExpiry(expiresIn);

  return {
    async createUploadUrl({ userId, scope }) {
      const itemId = randomUUID();
      const imageKey = wardrobeImageKey({ userId, scope, itemId });
      const uploadUrl = await getSignedUrl(
        s3Client,
        new PutObjectCommand({
          Bucket: bucketName,
          Key: imageKey,
          ContentType: WARDROBE_IMAGE_CONTENT_TYPE,
        }),
        { expiresIn: urlExpiresIn }
      );

      return {
        itemId,
        imageKey,
        uploadUrl,
        expiresIn: urlExpiresIn,
        contentType: WARDROBE_IMAGE_CONTENT_TYPE,
      };
    },

    async createImageUrl(imageKey) {
      return getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucketName,
          Key: imageKey,
          ResponseContentType: WARDROBE_IMAGE_CONTENT_TYPE,
        }),
        { expiresIn: urlExpiresIn }
      );
    },

    async assertImageReady(imageKey) {
      let image;
      try {
        image = await s3Client.send(
          new HeadObjectCommand({ Bucket: bucketName, Key: imageKey })
        );
      } catch (error) {
        if (isMissingObjectError(error)) {
          throw new HttpError("Uploaded wardrobe image was not found", 400, {
            cause: error as Error,
          });
        }
        throw error;
      }

      const contentType = image.ContentType?.toLowerCase().split(";")[0].trim();
      if (contentType !== WARDROBE_IMAGE_CONTENT_TYPE) {
        throw new HttpError("Uploaded wardrobe image must be a PNG", 400);
      }

      const size = Number(image.ContentLength ?? 0);
      if (!Number.isFinite(size) || size <= 0) {
        throw new HttpError("Uploaded wardrobe image is empty", 400);
      }
      if (size > MAX_WARDROBE_IMAGE_BYTES) {
        throw new HttpError("Uploaded wardrobe image is too large", 413);
      }
    },

    async deleteImage(imageKey) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: imageKey,
        })
      );
    },
  };
}

function normalizeExpiry(value: number) {
  if (!Number.isFinite(value)) return 900;
  return Math.max(60, Math.min(3600, Math.floor(value)));
}

function isMissingObjectError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    value.name === "NotFound" ||
    value.name === "NoSuchKey" ||
    value.$metadata?.httpStatusCode === 404
  );
}
