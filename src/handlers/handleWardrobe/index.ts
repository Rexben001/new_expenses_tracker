import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { makeDbService } from "../../services/shared/dbService";
import { makeWardrobeImageStore } from "../../services/wardrobe/imageStore";
import { makeDocumentClient } from "../../utils/dynamodb";
import { makeHandler } from "./handler";

const bucketName = process.env.WARDROBE_BUCKET_NAME;
if (!bucketName) throw new Error("WARDROBE_BUCKET_NAME is required");

const expiresIn = Number(process.env.WARDROBE_IMAGE_URL_EXPIRES_SECONDS ?? 900);

export const handler = makeHandler({
  dbService: makeDbService(
    makeDocumentClient({ dynamodb: new DynamoDBClient({}) }),
    process.env.TABLE_NAME!
  ),
  imageStore: makeWardrobeImageStore({
    bucketName,
    expiresIn,
    s3Client: new S3Client({}),
  }),
});
