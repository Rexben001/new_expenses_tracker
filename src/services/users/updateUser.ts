import { formatDbItem } from "../../utils/format-item";
import { successResponse } from "../../utils/response";
import { DbService } from "../dbService";

export const updateUser = async ({
  dbService,
  body,
  userId,
}: {
  dbService: DbService;
  body: string;
  userId: string;
}) => {
  if (!userId) {
    throw new Error("User ID is required for updating an expense");
  }

  const parsedBody = parseEventBody(body ?? "");

  const pk = `USER#${userId}`;
  const sk = `PROFILE#${userId}`;

  const updateExpression = Object.keys(parsedBody)
    .map((key) => `#${key} = :${key}`)
    .join(", ");

  const expressionAttributeNames = Object.keys(parsedBody).reduce(
    (acc, key) => ({ ...acc, [`#${key}`]: key }),
    {}
  );

  const expressionAttributeValues = Object.keys(parsedBody).reduce(
    (acc, key) => ({ ...acc, [`:${key}`]: parsedBody[key] }),
    {}
  );

  const item = await dbService.updateItem(
    { PK: pk, SK: sk },
    `SET ${updateExpression}`,
    expressionAttributeNames,
    expressionAttributeValues
  );

  return successResponse({
    message: "Expense updated successfully",
    item: formatDbItem(item),
  });
};

function parseEventBody(body: string) {
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error("Invalid JSON in request body");
  }
}
