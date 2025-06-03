import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DocumentClient } from "../utils/dynamodb";
import { QueryCommand } from "@aws-sdk/client-dynamodb";

export interface DbService {
  getItem(key: Record<string, any>): Promise<Record<string, any>>;
  putItem(item: Record<string, any>): Promise<void>;
  queryItems(
    // indexName: string,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, any>
  ): Promise<Record<string, any>[]>;
}

export function makeDbService(
  client: DocumentClient,
  tableName: string
): DbService {
  return {
    async getItem(key: Record<string, any>) {
      const command = new GetCommand({
        TableName: tableName,
        Key: key,
      });

      const response = await client.send(command);

      if (!response.Item) {
        throw new Error(
          `Item with key ${JSON.stringify(key)} not found in table ${tableName}`
        );
      }
      return response.Item;
    },

    async putItem(item: Record<string, any>) {
      const command = new PutCommand({
        TableName: tableName,
        Item: item,
      });
      const resp = await client.send(command);

      console.log("PutItem response:", resp);
    },

    async queryItems(
      // indexName: string,
      keyConditionExpression: string,
      expressionAttributeValues: Record<string, any>
    ) {
      const command = new QueryCommand({
        TableName: tableName,
        // IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      });
      const response = await client.send(command);

      if (!response.Items || response.Items.length === 0) {
        throw new Error(
          `No items found with condition ${keyConditionExpression}`
        );
      }
      return response.Items;
    },
  };
}
