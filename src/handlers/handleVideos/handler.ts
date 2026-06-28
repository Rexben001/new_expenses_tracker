import type { APIGatewayEvent, Context } from "aws-lambda";
import { randomUUID } from "crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getUserId } from "../../utils/getUserId";
import { HttpError } from "../../utils/http-error";
import { createInvocationLogger } from "../../utils/logger";
import { errorResponse, successResponse } from "../../utils/response";

type VideoUploadUrlRequestBody = {
  sessionId?: string;
  fileName?: string;
  contentType?: string;
  folder?: string;
};

type DeleteVideosRequestBody = {
  keys?: string[];
};

type VideoListItem = {
  key: string;
  sizeBytes: number;
  lastModified: string | null;
  etag: string | null;
  url: string;
  downloadUrl: string;
};

const SUPPORTED_VIDEO_CONTENT_TYPES = new Set(["video/mp4", "video/quicktime"]);
const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  ".mov",
  ".mp4",
  ".m4v",
  ".avi",
  ".mkv",
  ".3gp",
  ".3gpp",
  ".mts",
  ".m2ts",
  ".hevc",
]);

export const makeHandler = ({ s3Client }: { s3Client: S3Client }) => {
  return async (event: APIGatewayEvent, context: Context) => {
    const logger = createInvocationLogger(context, {
      handler: "handleVideos",
      path: event.path,
      method: event.httpMethod,
    });

    try {
      getUserId(event);

      if (event.httpMethod === "POST" && event.path.endsWith("/video-upload-url")) {
        return await handleCreateUploadUrl(event, s3Client);
      }

      if (event.httpMethod === "GET" && event.path.endsWith("/video-library/items")) {
        return await handleListVideos(event, s3Client);
      }

      if (event.httpMethod === "GET" && event.path.endsWith("/video-library/folders")) {
        return await handleListFolders(event, s3Client);
      }

      if (event.httpMethod === "DELETE" && event.path.endsWith("/video-library/items")) {
        return await handleDeleteVideos(event, s3Client);
      }

      throw new HttpError("Method not allowed", 405);
    } catch (error) {
      logger.error("Error handling video request", { error });

      if (error instanceof HttpError) {
        return errorResponse(error.message, error.status);
      }

      return errorResponse("Video request failed");
    }
  };
};

async function handleCreateUploadUrl(event: APIGatewayEvent, s3Client: S3Client) {
  const body = parseBody<VideoUploadUrlRequestBody>(event.body);
  const contentType =
    normalizeContentType(body.contentType) ?? contentTypeFromFileName(body.fileName);

  if (!contentType) {
    throw new HttpError("Only .mov and .mp4 videos are allowed.", 400);
  }

  const bucketName = requireEnv(
    "VIDEO_UPLOAD_BUCKET_NAME",
    process.env.VIDEO_UPLOAD_BUCKET_NAME
  );
  const expiresIn = parseExpiresIn(process.env.VIDEO_UPLOAD_URL_EXPIRES_SECONDS);
  const rootPrefix = getRootPrefix("VIDEO_UPLOAD_PREFIX");
  const prefix = normalizeAllowedPrefix(body.folder, rootPrefix);
  const sessionPart = sanitizePrefix(body.sessionId) || "default";
  const baseName = baseNameFromFileName(body.fileName);
  const extension = extensionFromContentType(contentType);
  const key = `${prefix}/${sessionPart}/${Date.now()}-${randomUUID()}-${baseName}.${extension}`;

  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn }
  );

  return successResponse({
    bucketName,
    key,
    s3Uri: `s3://${bucketName}/${key}`,
    uploadUrl,
    method: "PUT",
    expiresIn,
    contentType,
    prefix,
  });
}

async function handleListVideos(event: APIGatewayEvent, s3Client: S3Client) {
  const bucketName = requireEnv(
    "VIDEO_UPLOAD_BUCKET_NAME",
    process.env.VIDEO_UPLOAD_BUCKET_NAME
  );
  const rootPrefix = getRootPrefix("VIDEO_LIBRARY_PREFIX");
  const prefix = normalizeAllowedPrefix(event.queryStringParameters?.prefix, rootPrefix);
  const urlExpiresSeconds = parseExpiresIn(
    process.env.VIDEO_LIBRARY_URL_EXPIRES_SECONDS
  );
  const limit = parseLimit(event.queryStringParameters?.limit);
  const cursor = event.queryStringParameters?.cursor?.trim() || undefined;

  const listResult = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `${prefix}/`,
      MaxKeys: limit,
      ContinuationToken: cursor,
    })
  );

  const objects = (listResult.Contents ?? []).filter((entry) => {
    if (!entry.Key || entry.Key.endsWith("/")) return false;
    return isVideoKey(entry.Key);
  });

  const items: VideoListItem[] = await Promise.all(
    objects.map(async (entry) => {
      const key = entry.Key as string;
      const url = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: bucketName, Key: key }),
        { expiresIn: urlExpiresSeconds }
      );
      const downloadUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${fileNameFromKey(key)}"`,
        }),
        { expiresIn: urlExpiresSeconds }
      );

      return {
        key,
        sizeBytes: Number(entry.Size ?? 0),
        lastModified: entry.LastModified ? entry.LastModified.toISOString() : null,
        etag: entry.ETag ?? null,
        url,
        downloadUrl,
      };
    })
  );

  return successResponse({
    bucketName,
    prefix,
    limit,
    count: items.length,
    items,
    nextCursor: listResult.NextContinuationToken ?? null,
    truncated: Boolean(listResult.IsTruncated),
  });
}

async function handleListFolders(event: APIGatewayEvent, s3Client: S3Client) {
  const bucketName = requireEnv(
    "VIDEO_UPLOAD_BUCKET_NAME",
    process.env.VIDEO_UPLOAD_BUCKET_NAME
  );
  const rootPrefix = getRootPrefix("VIDEO_LIBRARY_PREFIX");
  const requestedRoot = event.queryStringParameters?.root;
  const folderRootPrefix = requestedRoot
    ? normalizeAllowedPrefix(requestedRoot, rootPrefix)
    : rootPrefix;
  const folders = new Set<string>([folderRootPrefix]);

  let continuationToken: string | undefined;
  while (true) {
    const listResult: ListObjectsV2CommandOutput = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: `${folderRootPrefix}/`,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      })
    );

    for (const entry of listResult.Contents ?? []) {
      if (!entry.Key || entry.Key.endsWith("/") || !isVideoKey(entry.Key)) {
        continue;
      }

      for (const folder of folderPrefixesFromKey(entry.Key, folderRootPrefix)) {
        folders.add(folder);
      }
    }

    continuationToken = listResult.NextContinuationToken ?? undefined;
    if (!listResult.IsTruncated || !continuationToken) break;
  }

  const sortedFolders = Array.from(folders).sort((left, right) =>
    left.localeCompare(right)
  );
  return successResponse({
    bucketName,
    rootPrefix: folderRootPrefix,
    count: sortedFolders.length,
    folders: sortedFolders,
  });
}

async function handleDeleteVideos(event: APIGatewayEvent, s3Client: S3Client) {
  const bucketName = requireEnv(
    "VIDEO_UPLOAD_BUCKET_NAME",
    process.env.VIDEO_UPLOAD_BUCKET_NAME
  );
  const rootPrefix = getRootPrefix("VIDEO_LIBRARY_PREFIX");
  const prefix = normalizeAllowedPrefix(event.queryStringParameters?.prefix, rootPrefix);
  const body = parseBody<DeleteVideosRequestBody>(event.body);
  const keys = Array.isArray(body.keys) ? body.keys : [];

  const uniqueKeys = Array.from(new Set(keys.map(normalizeKey).filter(Boolean)));
  if (!uniqueKeys.length) {
    throw new HttpError("keys must contain at least one S3 object key.", 400);
  }

  const invalidPrefixKeys = uniqueKeys.filter((key) => !isKeyInPrefix(key, prefix));
  if (invalidPrefixKeys.length) {
    throw new HttpError("Some keys are outside the allowed prefix.", 400);
  }

  const invalidVideoKeys = uniqueKeys.filter((key) => !isVideoKey(key));
  if (invalidVideoKeys.length) {
    throw new HttpError("Some keys are not recognized as video files.", 400);
  }

  const deletedKeys: string[] = [];
  const errors: Array<{ key: string; code?: string; message?: string }> = [];

  for (const keyChunk of chunkArray(uniqueKeys, 1000)) {
    const result = await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: keyChunk.map((key) => ({ Key: key })),
          Quiet: false,
        },
      })
    );

    for (const deleted of result.Deleted ?? []) {
      if (deleted.Key) deletedKeys.push(deleted.Key);
    }

    for (const itemError of result.Errors ?? []) {
      errors.push({
        key: itemError.Key ?? "",
        code: itemError.Code,
        message: itemError.Message,
      });
    }
  }

  return successResponse({
    requestedCount: uniqueKeys.length,
    deletedCount: deletedKeys.length,
    errorCount: errors.length,
    deletedKeys,
    errors,
  });
}

function parseBody<T>(body: string | null): T {
  if (!body) return {} as T;

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new HttpError("Invalid JSON body", 400);
  }
}

function requireEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function getRootPrefix(envName: "VIDEO_UPLOAD_PREFIX" | "VIDEO_LIBRARY_PREFIX") {
  return sanitizePrefix(process.env[envName] ?? "iphone-videos") || "iphone-videos";
}

function normalizeAllowedPrefix(input: string | undefined | null, rootPrefix: string) {
  const prefix = sanitizePrefix(input) || rootPrefix;
  if (prefix === rootPrefix || prefix.startsWith(`${rootPrefix}/`)) {
    return prefix;
  }

  throw new HttpError("Folder prefix is outside the allowed video root.", 400);
}

function parseExpiresIn(input: string | undefined) {
  const parsed = Number(input ?? "900");
  if (!Number.isFinite(parsed) || parsed <= 0) return 900;
  return Math.max(60, Math.min(3600, Math.floor(parsed)));
}

function normalizeContentType(input: string | undefined) {
  const normalized = input?.trim().toLowerCase().split(";")[0].trim();
  if (!normalized || !SUPPORTED_VIDEO_CONTENT_TYPES.has(normalized)) return null;
  return normalized;
}

function contentTypeFromFileName(fileName: string | undefined) {
  const lower = String(fileName ?? "").trim().toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov") || lower.endsWith(".qt")) return "video/quicktime";
  return null;
}

function extensionFromContentType(contentType: string) {
  if (contentType === "video/mp4") return "mp4";
  if (contentType === "video/quicktime") return "mov";
  return "bin";
}

function sanitizePrefix(value: string | undefined | null) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .slice(0, 240);
}

function normalizeKey(input: string) {
  return String(input)
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

function baseNameFromFileName(fileName: string | undefined) {
  const rawName =
    String(fileName ?? "").trim().split(/[\\/]/).pop() ?? "iphone-video";
  const withoutExtension = rawName.replace(/\.[^./\\]+$/, "");
  const safe = withoutExtension
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return safe || "iphone-video";
}

function extensionOfKey(key: string) {
  const lower = key.toLowerCase();
  const extensionIndex = lower.lastIndexOf(".");
  return extensionIndex < 0 ? "" : lower.slice(extensionIndex);
}

function isVideoKey(key: string) {
  return SUPPORTED_VIDEO_EXTENSIONS.has(extensionOfKey(key));
}

function isKeyInPrefix(key: string, prefix: string) {
  return key === prefix || key.startsWith(`${prefix}/`);
}

function parseLimit(input: string | undefined) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function fileNameFromKey(key: string) {
  return (
    key
      .split("/")
      .pop()
      ?.replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "video"
  );
}

function folderPrefixesFromKey(key: string, rootPrefix: string) {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey || !isKeyInPrefix(normalizedKey, rootPrefix)) return [];

  const relative = normalizedKey.slice(rootPrefix.length + 1);
  const segments = relative.split("/").filter(Boolean);
  if (segments.length <= 1) return [];

  const folders: string[] = [];
  let current = rootPrefix;
  for (let index = 0; index < segments.length - 1; index += 1) {
    current = `${current}/${segments[index]}`;
    folders.push(current);
  }
  return folders;
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}
