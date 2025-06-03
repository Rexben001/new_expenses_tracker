import type { APIGatewayEvent } from "aws-lambda";
import { DbService } from "../../services/dbService";
import {
  Expense,
  ExpenseRequest,
  ExpenseRequestSchema,
  ExpenseSchema,
} from "../../domain/models/expense";
import { HttpError } from "../../utils/http-error";
import { randomUUID } from "crypto";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (event: APIGatewayEvent) => {
    try {
      const body = parseEventBody(event.body ?? "");

      const item = {
        id: randomUUID(),
        updatedAt: new Date().toISOString(),
        ...body,
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

const parseEventBody = (body: string): ExpenseRequest => {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    return ExpenseRequestSchema.parse({ ...json });
  } catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
    });
  }
};
