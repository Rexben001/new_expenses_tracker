import type { APIGatewayEvent } from "aws-lambda";
import { DbService } from "../../services/dbService";
import { Expense, ExpenseSchema } from "../../domain/models/expense";
import { HttpError } from "../../utils/http-error";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (event: APIGatewayEvent) => {
    try {
      const id = event.pathParameters?.id;
      if (!id) {
        throw new HttpError("Expense ID is required", 400);
      }

      const expense = await dbService.getItem({ id });

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Expense retrieved successfully",
          expense,
        }),
      };
    } catch (error) {
      console.error("Error creating expense:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Internal server error" }),
      };
    }
  };
};
