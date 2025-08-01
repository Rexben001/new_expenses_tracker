import { randomUUID } from "node:crypto";
import { BudgetRequest, BudgetRequestSchema } from "../../domain/models/budget";
import { HttpError } from "../../utils/http-error";
import { DbService } from "../shared/dbService";
import { formatDbItem } from "../../utils/format-item";
import { successResponse } from "../../utils/response";

export const createBudgetOnly = async ({
  dbService,
  body,
  userId,
  budgetId
}: {
  dbService: DbService;
  body: string;
  userId: string;
    budgetId?: string;

}) => {
  const _budgetId = budgetId ?? randomUUID();

  const parsedBody = parseEventBody(body ?? "");

  const pk = `USER#${userId}`;
  const sk = `BUDGET#${_budgetId}`;

  const category = parsedBody.category || "Others"; // Default category if not provided

  const item = {
    ...parsedBody,
    PK: pk,
    SK: sk,
    userId,
    id: _budgetId,
    category,
    updatedAt: parsedBody.updatedAt || new Date().toISOString(),
  };

  await dbService.putItem(item);

  return item;
};
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
  const item = await createBudgetOnly({
    dbService,
    body,
    userId,
  });

  return successResponse(
    {
      message: "Budget created successfully",
      item: formatDbItem(item),
    },
    201
  );
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
