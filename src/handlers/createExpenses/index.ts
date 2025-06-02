import { makeHandler } from "./handler";
import { makeDbService } from "../../services/dbService";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { makeDocumentClient } from "../../utils/dynamodb";

export const handler = makeHandler({
  dbService: makeDbService(
    makeDocumentClient({ dynamodb: new DynamoDBClient({}) }),
    process.env.TABLE_NAME ?? "Expenses"
  ),
});
