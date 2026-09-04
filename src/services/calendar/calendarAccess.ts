import type { APIGatewayEvent } from "aws-lambda";
import { createPk } from "../../utils/createPk";
import { isAdminEmail } from "../../utils/admin";
import { HttpError } from "../../utils/http-error";
import type { DbService } from "../shared/dbService";

export async function assertCalendarAccess({
  event,
  userDbService,
  userId,
}: {
  event: APIGatewayEvent;
  userDbService: DbService;
  userId: string;
}) {
  const email = event.requestContext?.authorizer?.claims?.email;
  if (isAdminEmail(email)) return;

  const profiles = await userDbService.queryItems(
    "PK = :pk AND SK = :sk",
    {
      ":pk": { S: createPk(userId) },
      ":sk": { S: `PROFILE#${userId}` },
    }
  );

  if (!profiles[0]?.calendarEnabled) {
    throw new HttpError("Calendar access required", 403);
  }
}
