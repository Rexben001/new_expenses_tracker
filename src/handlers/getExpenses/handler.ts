import type { APIGatewayEvent } from "aws-lambda";
import { DbService } from "../../services/dbService";
import { ExpenseSchema } from "../../domain/models/expense";
import { HttpError } from "../../utils/http-error";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (event: APIGatewayEvent) => {
    try {
      const userId = event.pathParameters?.userId;
      const expenseId = event.pathParameters?.expenseId;

      if (!userId || !expenseId) {
        throw new HttpError("User ID and Expense ID are required", 400);
      }

      if (expenseId === "all") {
        return await getItems(userId, dbService);
      }

      return await getItem(expenseId!, dbService);
    } catch (error) {
      console.error("Error retrieving expense:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Internal server error" }),
      };
    }
  };
};

const getItem = async (id: string, dbService: DbService) => {
  const expense = await dbService.getItem({ id });

  if (!expense) {
    throw new HttpError(`Expense with ID ${id} not found`, 404);
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Expense retrieved successfully",
      expense: ExpenseSchema.parse(expense),
    }),
  };
};

const getItems = async (userId: string, dbService: DbService) => {
  const expenses = await dbService.queryItems("userId = :userId", {
    ":userId": userId,
  });
  if (!expenses || expenses.length === 0) {
    throw new HttpError(`No expenses found for user ID ${userId}`, 404);
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Expenses retrieved successfully",
      expenses: expenses.map((expense) => ExpenseSchema.parse(expense)),
    }),
  };
};
