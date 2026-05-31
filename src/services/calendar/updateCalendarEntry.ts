import { randomUUID } from "node:crypto";
import {
  CalendarClient,
  CalendarEntryUpdateRequestSchema,
} from "../../domain/models/calendar";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const updateCalendarEntry = async ({
  dbService,
  body,
  userId,
  calendarEntryId,
  subAccountId,
}: {
  dbService: DbService;
  body: string;
  userId: string;
  calendarEntryId?: string;
  subAccountId?: string;
}) => {
  if (!calendarEntryId) {
    throw new HttpError("Calendar entry ID is required for updating", 400);
  }

  const parsedBody = parseEventBody(body ?? "");
  const updateBody: Record<string, unknown> = {
    ...parsedBody,
    ...(parsedBody.clients
      ? { clients: normalizeClients(parsedBody.clients) }
      : {}),
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
    { PK: createPk(userId, subAccountId), SK: `CALENDAR#${calendarEntryId}` },
    `SET ${updateExpression}`,
    expressionAttributeNames,
    expressionAttributeValues
  );

  return successResponse({
    message: "Calendar entry updated successfully",
    item: formatDbItem(item),
  });
};

function normalizeClients(clients?: CalendarClient[]) {
  return (clients ?? [])
    .map((client) => ({
      ...client,
      id: client.id || randomUUID(),
      name: client.name.trim(),
    }))
    .filter((client) => client.name);
}

function parseEventBody(body: string) {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    return CalendarEntryUpdateRequestSchema.parse({ ...json });
  } catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
    });
  }
}
