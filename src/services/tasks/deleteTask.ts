import { createPk } from "../../utils/createPk";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const deleteTask = async ({
  dbService,
  userId,
  taskId,
  subAccountId,
}: {
  dbService: DbService;
  userId: string;
  taskId?: string;
  subAccountId?: string;
}) => {
  if (!taskId) {
    throw new HttpError("Task ID is required for deletion", 400);
  }

  await dbService.deleteItem({
    PK: createPk(userId, subAccountId),
    SK: `TASK#${taskId}`,
  });

  return successResponse({ message: "Task deleted successfully" });
};
