import { TaskUpdateRequestSchema } from "../../domain/models/task";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const updateTask = async ({
  dbService,
  body,
  userId,
  taskId,
  subAccountId,
}: {
  dbService: DbService;
  body: string;
  userId: string;
  taskId?: string;
  subAccountId?: string;
}) => {
  if (!taskId) {
    throw new HttpError("Task ID is required for updating", 400);
  }

  const parsedBody = parseEventBody(body ?? "");
  const updateBody: Record<string, unknown> = {
    ...parsedBody,
    updatedAt: parsedBody.updatedAt ?? new Date().toISOString(),
  };

  const updateExpression = Object.keys(updateBody)
    .map((key) => `#${key} = :${key}`)
    .join(", ");

  const expressionAttributeNames = Object.keys(updateBody).reduce(
    (acc, key) => ({ ...acc, [`#${key}`]: key }),
    {}
  );

  const expressionAttributeValues = Object.keys(updateBody).reduce(
    (acc, key) => ({ ...acc, [`:${key}`]: updateBody[key] }),
    {}
  );

  const item = await dbService.updateItem(
    { PK: createPk(userId, subAccountId), SK: `TASK#${taskId}` },
    `SET ${updateExpression}`,
    expressionAttributeNames,
    expressionAttributeValues
  );

  return successResponse({
    message: "Task updated successfully",
    item: formatDbItem(item),
  });
};

function parseEventBody(body: string) {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    return TaskUpdateRequestSchema.parse({ ...json });
  } catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
    });
  }
}
