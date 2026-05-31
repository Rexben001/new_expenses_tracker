import { CalendarEntry } from "../../domain/models/calendar";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

type GetCalendarEntries = {
  dbService: DbService;
  userId: string;
  calendarEntryId?: string;
  subAccountId?: string;
};

export const getCalendarEntries = async ({
  dbService,
  userId,
  calendarEntryId,
  subAccountId,
}: GetCalendarEntries) => {
  const items = await getCalendarEntryItems({
    dbService,
    userId,
    calendarEntryId,
    subAccountId,
  });

  return formatResponse(items);
};

export async function getCalendarEntryItems({
  dbService,
  userId,
  calendarEntryId,
  subAccountId,
}: GetCalendarEntries) {
  return dbService.queryItems(
    getKeyConditionExpression(calendarEntryId),
    getExpressionAttributeValues(userId, calendarEntryId, subAccountId)
  );
}

const formatResponse = (items: Record<string, any>[]) => {
  const entries = items.map(formatDbItem) as CalendarEntry[];

  return successResponse(
    entries.sort((a, b) => {
      const dateSort = a.date.localeCompare(b.date);
      if (dateSort !== 0) return dateSort;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
  );
};

const getKeyConditionExpression = (calendarEntryId?: string): string => {
  if (calendarEntryId) {
    return "PK = :pk AND SK = :sk";
  }

  return "PK = :pk AND begins_with(SK, :skPrefix)";
};

const getExpressionAttributeValues = (
  userId: string,
  calendarEntryId?: string,
  subAccountId?: string
): Record<string, any> => {
  if (calendarEntryId) {
    return {
      ":pk": { S: createPk(userId, subAccountId) },
      ":sk": { S: `CALENDAR#${calendarEntryId}` },
    };
  }

  return {
    ":pk": { S: createPk(userId, subAccountId) },
    ":skPrefix": { S: "CALENDAR#" },
  };
};
