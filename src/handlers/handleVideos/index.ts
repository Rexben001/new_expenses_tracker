import { S3Client } from "@aws-sdk/client-s3";
import { makeHandler } from "./handler";

export const handler = makeHandler({
  s3Client: new S3Client({}),
});
