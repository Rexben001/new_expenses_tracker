import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { errorResponse, successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const getUser = async ({
  dbService,
  userId,
  subAccountId,
}: {
  dbService: DbService;
  userId: string;
  subAccountId?: string;
}) => {
  const pk = createPk(userId);

  if (subAccountId) {
    // Fetch both profile and sub account in parallel
    const [profileItems, subAccountItems] = await Promise.all([
      dbService.queryItems("PK = :pk AND SK = :sk", {
        ":pk": { S: createPk(userId) },
        ":sk": { S: `PROFILE#${userId}` },
      }),
      dbService.queryItems("PK = :pk AND SK = :sk", {
        ":pk": { S: pk },
        ":sk": { S: `SUB#${subAccountId}` },
      }),
    ]);

    if (!profileItems.length) return errorResponse("Profile not found", 404);
    if (!subAccountItems.length)
      return errorResponse("Sub account not found", 404);

    return successResponse({
      profile: formatDbItem({
        ...profileItems[0],
        accountType: "Sub",
      }),
      subAccount: formatDbItem(subAccountItems[0]),
    });
  } else {
    // Fetch profile and all sub accounts in parallel
    const [profileItems, subAccountItems] = await Promise.all([
      dbService.queryItems("PK = :pk AND SK = :sk", {
        ":pk": { S: pk },
        ":sk": { S: `PROFILE#${userId}` },
      }),
      dbService.queryItems("PK = :pk AND begins_with(SK, :skPrefix)", {
        ":pk": { S: pk },
        ":skPrefix": { S: "SUB#" },
      }),
    ]);

    if (!profileItems.length) return errorResponse("Profile not found", 404);

    return successResponse({
      profile: formatDbItem({
        ...profileItems[0],
        accountType: "Main",
      }),
      subAccounts: subAccountItems.map(formatDbItem),
    });
  }
};
