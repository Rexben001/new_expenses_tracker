import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { KMSClient } from "@aws-sdk/client-kms";
import { makeDbService } from "../../services/shared/dbService";
import { makeDocumentClient } from "../../utils/dynamodb";
import { makeHandler } from "./handler";

export const handler = makeHandler({
  dbService: makeDbService(
    makeDocumentClient({ dynamodb: new DynamoDBClient({}) }),
    process.env.TABLE_NAME!
  ),
  kmsClient: new KMSClient({}),
});
