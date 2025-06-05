import { DbService } from "../dbService";

export const getExpenses = async ({
  dbService,
  userId,
  expenseId,
  budgetId,
}: {
  dbService: DbService;
  userId: string;
  expenseId?: string;
  budgetId?: string;
}) => {
  const keyConditionExpression = "PK = :pk AND SK = :sk";

  const expressionAttributeValues = {
    ":pk": getPK(userId, budgetId),
    ":sk": getSK(expenseId),
  };
  try {
    const items = await dbService.queryItems(
      keyConditionExpression,
      expressionAttributeValues
    );

    // Map items to the expected format
    const expenses = items.map((item) => ({
      id: item.id,
      amount: item.amount,
      description: item.description,
      date: item.date,
      category: item.category,
      updatedAt: item.updatedAt,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ expenses }),
    };
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

const getPK = (userId: string, budgetId?: string): string => {
  return budgetId ? `USER#${userId}#BUDGET#${budgetId}` : `USER#${userId}`;
};

const getSK = (expenseId?: string): string => {
  return expenseId ? `EXPENSE#${expenseId}` : "EXPENSE";
};
