import { formatDbItem } from "../../utils/format-item";
import { errorResponse, successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const getUser = async ({
  dbService,
  userId,
}: {
  dbService: DbService;
  userId: string;
}) => {
  const users = await dbService.queryItems("PK = :pk AND SK = :sk", {
    PK: `USER#${userId}`,
    SK: `PROFILE#${userId}`,
  });

  if (!users.length) return errorResponse("User not found", 404);

  return successResponse(formatDbItem(users)[0]);
};
