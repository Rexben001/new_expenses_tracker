import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { makeDbService } from "../../services/shared/dbService";
import { makeDocumentClient } from "../../utils/dynamodb";
import { makeHandler } from "./handler";

const client = makeDocumentClient({ dynamodb: new DynamoDBClient({}) });
export const handler = makeHandler({
  planDb: makeDbService(client, process.env.TABLE_NAME!),
  inventoryDb: makeDbService(client, process.env.FOOD_ITEMS_TABLE_NAME!),
});
