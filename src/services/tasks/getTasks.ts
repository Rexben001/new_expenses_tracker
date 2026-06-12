import { Task } from "../../domain/models/task";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { errorResponse, successResponse } from "../../utils/response";
import { sortItemByRecent } from "../../utils/sort-item";
import { DbService } from "../shared/dbService";

type GetTasks = {
  dbService: DbService;
  userId: string;
  taskId?: string;
  subAccountId?: string;
};

export const getTasks = async ({
  dbService,
  userId,
  taskId,
  subAccountId,
}: GetTasks) => {
  const items = await getTaskItems({
    dbService,
    userId,
    taskId,
    subAccountId,
  });

  return formatResponse(items, Boolean(taskId));
};

export async function getTaskItems({
  dbService,
  userId,
  taskId,
  subAccountId,
}: GetTasks) {
  const items = await dbService.queryItems(
    getKeyConditionExpression(taskId),
    getExpressionAttributeValues(userId, taskId, subAccountId)
  );

  return items;
}

const formatResponse = (items: Record<string, any>[], expectsSingle: boolean) => {
  if (items.length === 0) {
    if (!expectsSingle) {
      return successResponse([]);
    }

    return errorResponse("No tasks found for the given criteria", 404);
  }

  const tasks = items.map(formatDbItem);

  return successResponse(sortItemByRecent(tasks as Task[]));
};

const getKeyConditionExpression = (taskId?: string): string => {
  if (taskId) {
    return "PK = :pk AND SK = :sk";
  }

  return "PK = :pk AND begins_with(SK, :skPrefix)";
};

const getExpressionAttributeValues = (
  userId: string,
  taskId?: string,
  subAccountId?: string
): Record<string, any> => {
  if (taskId) {
    return {
      ":pk": { S: createPk(userId, subAccountId) },
      ":sk": { S: `TASK#${taskId}` },
    };
  }

  return {
    ":pk": { S: createPk(userId, subAccountId) },
    ":skPrefix": { S: "TASK#" },
  };
};
