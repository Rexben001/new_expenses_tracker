import { randomUUID } from "node:crypto";
import {
  CalendarClient,
  CalendarEntryRequest,
  CalendarEntryRequestSchema,
} from "../../domain/models/calendar";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const createCalendarEntry = async ({
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
  const entryId = calendarEntryId ?? randomUUID();
  const parsedBody = parseEventBody(body ?? "");
  const now = new Date().toISOString();
  const clients = normalizeClients(parsedBody.clients);

  const item = {
    ...parsedBody,
    PK: createPk(userId, subAccountId),
    SK: `CALENDAR#${entryId}`,
    userId,
    id: entryId,
    clients,
    status: parsedBody.status ?? (clients.length ? "booked" : "available"),
    createdAt: parsedBody.createdAt ?? now,
    updatedAt: parsedBody.updatedAt ?? now,
    subAccountId: subAccountId ?? undefined,
  };

  await dbService.putItem(item);

  return successResponse(
    {
      message: "Calendar entry created successfully",
      item: formatDbItem(item),
    },
    201
  );
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

const parseEventBody = (body: string): CalendarEntryRequest => {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    return CalendarEntryRequestSchema.parse({ ...json });
  } catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
    });
  }
};
