import { formatDbItem } from "../../utils/format-item";
import { HttpError } from "../../utils/http-error";
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

  const parsedBody = parseEventBody(body ?? "", Boolean(subAccountId));

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

function parseEventBody(body: string, isSubAccount: boolean) {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const allowedFields = new Set(
      isSubAccount
        ? ["name", "currency", "budgetStartDay"]
        : ["userName", "currency", "budgetStartDay", "colorMode"]
    );
    const parsed = Object.fromEntries(
      Object.entries(json).filter(([key]) => allowedFields.has(key))
    );

    if (!Object.keys(parsed).length) {
      throw new HttpError("No editable profile fields were provided", 400);
    }
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("Invalid JSON in request body", 400, {
      cause: error as Error,
    });
  }
}
