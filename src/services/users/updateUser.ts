import { formatDbItem } from "../../utils/format-item";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const updateUser = async ({
  dbService,
  body,
  userId,
  subAccountId,
}: {
  dbService: DbService;
  body: string;
  userId: string;
  subAccountId?: string;
}) => {
  if (!userId) {
    throw new Error("User ID is required for updating an user");
  }

  const parsedBody = parseEventBody(body ?? "");

  const pk = `USER#${userId}`;
  const sk = subAccountId ? `SUB#${subAccountId}` : `PROFILE#${userId}`;

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
    message: "User updated successfully",
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
