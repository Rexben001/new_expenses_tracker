import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DocumentClient } from "../utils/dynamodb";
import {
  DeleteItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

export interface DbService {
  getItem(key: Record<string, any>): Promise<Record<string, any>>;
  putItem(item: Record<string, any>): Promise<void>;
  queryItems(
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, any>,
    indexName?: string
  ): Promise<Record<string, any>[]>;
  updateItem(
    key: Record<string, any>,
    updateExpression: string,
    expressionAttributeNames: Record<string, string>,
    expressionAttributeValues: Record<string, any>
  ): Promise<Record<string, any>>;
  deleteItem(key: Record<string, any>): Promise<void>;
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
      const command = new PutItemCommand({
        TableName: tableName,
        Item: marshall(item),
        ConditionExpression:
          "attribute_not_exists(PK) AND attribute_not_exists(SK)", // optional safety
      });
      await client.send(command);
    },

    async queryItems(
      keyConditionExpression: string,
      expressionAttributeValues: Record<string, any>,
      indexName?: string
    ) {
      const command = new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ...(indexName && { IndexName: indexName }),
      });
      const response = await client.send(command);

      if (!response.Items || response.Items.length === 0) {
        return [];
      }
      return response.Items.map((item) => unmarshall(item));
    },

    async updateItem(
      key: Record<string, any>,
      updateExpression: string,
      expressionAttributeNames: Record<string, string>,
      expressionAttributeValues: Record<string, any>
    ) {
      const command = new UpdateItemCommand({
        TableName: tableName,
        Key: marshall(key),
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: marshall(expressionAttributeValues),
        ExpressionAttributeNames: expressionAttributeNames,
        ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)", // optional safety
        ReturnValues: "ALL_NEW",
      });
      const response = await client.send(command);
      return unmarshall(response.Attributes || {});
    },

    async deleteItem(key: Record<string, any>) {
      const command = new DeleteItemCommand({
        TableName: tableName,
        Key: marshall(key),
        ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)", // optional safety
      });
      await client.send(command);
    },

    // async deleteItemsByPrefix(
    //   partitionKey: string,
    //   prefix: string
    // ): Promise<void> {
    //   const command = new QueryCommand({
    //     TableName: tableName,
    //     KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    //     ExpressionAttributeValues: {
    //       ":pk": { S: partitionKey },
    //       ":skPrefix": { S: prefix },
    //     },
    //   });

    //   const response = await client.send(command);
    //   const items = response.Items || [];

    //   for (const item of items) {
    //     const deleteCommand = new DeleteItemCommand({
    //       TableName: tableName,
    //       Key: {
    //         PK: item.PK,
    //         SK: item.SK,
    //       },
    //     });
    //     await client.send(deleteCommand);
    //   }
    // }
  };
}
