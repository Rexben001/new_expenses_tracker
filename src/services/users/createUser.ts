import { DbService } from "../shared/dbService";

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
    currency: "EUR",
  });

  return {
    statusCode: 201,
    body: JSON.stringify({ message: "User created successfully", userId }),
  };
};

export const createSubAccount = async ({
  dbService,
  userId,
}: {
  dbService: DbService;
  userId: string;
}) => {
  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "User ID is required",
      }),
    };
  }
  const subAccountId = crypto.randomUUID();

  await dbService.putItem({
    PK: `USER#${userId}`,
    SK: `SUB#${subAccountId}`,
    userId,
    subAccountId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: "Default",
    currency: "EUR",
  });

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: "Sub Account created successfully",
      subAccountId,
    }),
  };
};
