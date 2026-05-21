import { randomUUID } from "node:crypto";
import { TaskRequest, TaskRequestSchema } from "../../domain/models/task";
import { HttpError } from "../../utils/http-error";
import { DbService } from "../shared/dbService";
import { formatDbItem } from "../../utils/format-item";
import { successResponse } from "../../utils/response";
import { createPk } from "../../utils/createPk";

export const createTask = async ({
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
  const _taskId = taskId ?? randomUUID();
  const parsedBody = parseEventBody(body ?? "");
  const now = new Date().toISOString();
  const defaultDueAt = getDefaultDueAt();

  const pk = createPk(userId, subAccountId);
  const sk = `TASK#${_taskId}`;

  const item = {
    ...parsedBody,
    PK: pk,
    SK: sk,
    userId,
    id: _taskId,
    tags: parsedBody.tags ?? [],
    subtasks: parsedBody.subtasks ?? [],
    dueDate: parsedBody.dueDate ?? toDateInputValue(defaultDueAt),
    dueTime: parsedBody.dueTime ?? toTimeInputValue(defaultDueAt),
    reminderOffsetMinutes: parsedBody.reminderOffsetMinutes ?? 10,
    completed: parsedBody.completed ?? false,
    priority: parsedBody.priority ?? "medium",
    createdAt: parsedBody.createdAt ?? now,
    updatedAt: parsedBody.updatedAt ?? now,
    subAccountId: subAccountId ?? undefined,
  };

  await dbService.putItem(item);

  return successResponse(
    {
      message: "Task created successfully",
      item: formatDbItem(item),
    },
    201
  );
};

function getDefaultDueAt() {
  const date = new Date();
  date.setHours(date.getHours() + 1, date.getMinutes(), 0, 0);
  return date;
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTimeInputValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

const parseEventBody = (body: string): TaskRequest => {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    return TaskRequestSchema.parse({ ...json });
  } catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
    });
  }
};
