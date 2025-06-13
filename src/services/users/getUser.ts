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
    ":pk": { S: `USER#${userId}` },
    ":sk": { S: `PROFILE#${userId}` },
  });

  console.log({ users });

  if (!users.length) return errorResponse("User not found", 404);

  const user = formatDbItem(users[0]);

  return successResponse(user);
};
