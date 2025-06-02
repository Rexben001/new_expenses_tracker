import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { TranslateConfig } from "@aws-sdk/lib-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export type DocumentClient = DynamoDBDocumentClient;

interface DocumentClientOptions {
  dynamodb: DynamoDBClient;
}

export function makeDocumentClient({ dynamodb }: DocumentClientOptions) {
  const translateConfig: TranslateConfig = {
    marshallOptions: {
      convertEmptyValues: false,
      removeUndefinedValues: true,
      convertClassInstanceToMap: false,
    },
    unmarshallOptions: {
      wrapNumbers: false,
    },
  };

  return DynamoDBDocumentClient.from(dynamodb, translateConfig);
}
