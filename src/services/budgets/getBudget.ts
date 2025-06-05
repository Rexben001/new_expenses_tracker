import { DbService } from "../dbService";

export const getBudget = async ({
  dbService,
  userId,
  budgetId,
}: {
  dbService: DbService;
  userId: string;
  budgetId?: string;
}) => {
  const keyConditionExpression = "PK = :pk AND SK = :sk";

  const expressionAttributeValues = {
    ":pk": `USER#${userId}`,
    ":sk": budgetId ? `BUDGET#${budgetId}` : "BUDGET",
  };

  try {
    const items = await dbService.queryItems(
      keyConditionExpression,
      expressionAttributeValues
    );

    if (items.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Budget not found" }),
      };
    }

    const budget = items;

    return {
      statusCode: 200,
      body: JSON.stringify({
        budget,
      }),
    };
  } catch (error) {
    console.error("Error fetching budget:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
