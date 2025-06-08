import { randomUUID } from "node:crypto";
import { BudgetRequest, BudgetRequestSchema } from "../../domain/models/budget";
import { HttpError } from "../../utils/http-error";
import { DbService } from "../dbService";
import { formatDbItem } from "../../utils/format-item";

export const createBudget = async ({
  dbService,
  body,
  userId,
}: {
  dbService: DbService;
  body: string;
  userId: string;
  budgetId?: string;
}) => {
  const budgetId = randomUUID();

  const parsedBody = parseEventBody(body ?? "");

  const pk = `USER#${userId}`;
  const sk = `BUDGET#${budgetId}`;

  const item = {
    ...parsedBody,
    PK: pk,
    SK: sk,
    userId,
    id: budgetId,
    updatedAt: new Date().toISOString(),
  };

  await dbService.putItem(item);
  return {
    statusCode: 201,
    body: JSON.stringify({
      message: "Budget created successfully",
      item: formatDbItem(item),
    }),
  };
};

const parseEventBody = (body: string): BudgetRequest => {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    return BudgetRequestSchema.parse({ ...json });
  } catch (error) {
    throw new HttpError("Invalid request body", 400, {
      cause: error as Error,
    });
  }
};
