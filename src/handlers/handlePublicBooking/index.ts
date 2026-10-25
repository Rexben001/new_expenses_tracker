import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { makeDbService } from "../../services/shared/dbService";
import { makeDocumentClient } from "../../utils/dynamodb";
import { makeHandler } from "./handler";

export const handler = makeHandler({
  dbService: makeDbService(
    makeDocumentClient({ dynamodb: new DynamoDBClient({}) }),
    process.env.TABLE_NAME!,
  ),
  bookingUserId: process.env.BOOKING_USER_ID!,
  s3Client: new S3Client({}),
  bookingImageBucket: process.env.BOOKING_IMAGE_BUCKET!,
});
