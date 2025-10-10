import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

export const deleteSubAccount = async ({
  dbService,
  userId,
  subAccountId,
}: {
  dbService: DbService;
  userId: string;
  subAccountId?: string;
}) => {
  if (!userId || !subAccountId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "User ID and Sub-Account ID are required",
      }),
    };
  }

  // Delete all items associated with the sub-account
  const itemsToDelete = await dbService.queryItems("PK = :pk", {
    ":pk": `USER#${userId}#SUB#${subAccountId}`,
  });

  const deletePromises = itemsToDelete.map((item) =>
    dbService.deleteItem({ PK: item.PK, SK: item.SK })
  );

  await Promise.all(deletePromises);

  return successResponse({
    message: "Sub-account and associated data deleted successfully",
  });
};
