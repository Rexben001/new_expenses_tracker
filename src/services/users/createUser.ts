import { DbService } from "../dbService";

export const createUser = async ({
  dbService,
  userId,
  email,
}: {
  dbService: DbService;
  userId: string;
  email: string;
}) => {
  if (!userId || !email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "User ID is required" }),
    };
  }

  await dbService.putItem({
    PK: `USER#${userId}`,
    SK: `PROFILE#${userId}`,
    email,
    updatedAt: new Date().toISOString(),
    userId,
  });

  return {
    statusCode: 201,
    body: JSON.stringify({ message: "User created successfully", userId }),
  };
};
