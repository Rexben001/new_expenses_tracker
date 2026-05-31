import { createPk } from "../../utils/createPk";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const deleteCalendarEntry = async ({
  dbService,
  userId,
  calendarEntryId,
  subAccountId,
}: {
  dbService: DbService;
  userId: string;
  calendarEntryId?: string;
  subAccountId?: string;
}) => {
  if (!calendarEntryId) {
    throw new HttpError("Calendar entry ID is required for deletion", 400);
  }

  await dbService.deleteItem({
    PK: createPk(userId, subAccountId),
    SK: `CALENDAR#${calendarEntryId}`,
  });

  return successResponse({ message: "Calendar entry deleted successfully" });
};
