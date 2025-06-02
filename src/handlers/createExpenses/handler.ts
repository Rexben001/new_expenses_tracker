import type { APIGatewayEvent } from "aws-lambda";
import { DbService } from "../../services/dbService";
import { Expense, ExpenseSchema } from "../../domain/models/expense";
import { HttpError } from "../../utils/http-error";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (event: APIGatewayEvent) => {
    try {
      const body = parseEventBody(event.body ?? "");
      const { id, amount, description } = body;

      if (!id || !amount || !description) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Missing required fields" }),
        };
      }

      const item = {
        id,
        amount,
        description,
        createdAt: new Date().toISOString(),
      };

      await dbService.putItem(item);

      return {
        statusCode: 201,
        body: JSON.stringify({ message: "Expense created successfully", item }),
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

const parseEventBody = (body: string): Expense => {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    return ExpenseSchema.parse({ ...json });
  } catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
    });
  }
};
