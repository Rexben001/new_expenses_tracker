import { formatISO, subMonths } from "date-fns";
import { Budget } from "../../domain/models/budget";
import { createPk, createExpensesPk } from "../../utils/createPk";
import { createBudgetOnly } from "../budgets/createBudget";
import { DbService } from "../shared/dbService";

export const getRecurringBudgets = async (
  dbService: DbService,
  userId: string,
  subAccountId?: string
) => {
  const pk = createPk(userId, subAccountId);
  console.log({
    pk,
  });
  const cutoffDate = formatISO(subMonths(new Date(), 1), {
    representation: "date",
  }); // e.g. 2025-10-25

  return dbService.queryItems(
    "PK = :pk AND begins_with(SK, :skPrefix)",
    {
      ":pk": { S: pk },
      ":skPrefix": { S: "BUDGET#" },
      ":isRecurring": { BOOL: true },
      ":cutoffDate": { S: cutoffDate },
    },
    "isRecurring = :isRecurring AND updatedAt = :cutoffDate"
  );
};

export const getRecurringExpensesForBudget = async (
  dbService: DbService,
  userId: string,
  budgetId: string,
  subAccountId?: string
) => {
  const pk = createExpensesPk(userId, budgetId, subAccountId);
  const cutoffDate = formatISO(subMonths(new Date(), 1), {
    representation: "date",
  });

  console.log({ pk });

  return dbService.queryItems(
    "PK = :pk AND begins_with(SK, :skPrefix)",
    {
      ":pk": { S: pk },
      ":skPrefix": { S: "EXPENSE#" },
      ":isRecurring": { BOOL: true },
      ":cutoffDate": { S: cutoffDate },
    },
    "isRecurring = :isRecurring AND updatedAt = :cutoffDate"
  );
};

export async function saveBudgetInstancesToDb(
  dbService: DbService,
  budgetInstances: Budget[]
) {
  if (budgetInstances.length === 0) return [];
  return Promise.all(
    budgetInstances.map((budget) =>
      createBudgetOnly({
        dbService,
        body: JSON.stringify(budget),
        userId: budget.userId,
        subAccountId: budget.subAccountId,
        oldBudgetId: budget.id,
      })
    )
  );
}

export async function getAllUsersWithSubAccounts(dbService: DbService) {
  // 1️⃣ Get all PROFILE# items
  const profiles = await dbService.scanItems("begins_with(SK, :skPrefix)", {
    ":skPrefix": { S: "PROFILE#" },
  });

  const users: any[] = [];

  for (const profile of profiles) {
    const userId = profile.SK.split("#")[1];
    const pk = `USER#${userId}`;

    const subAccounts = await dbService.queryItems(
      "PK = :pk AND begins_with(SK, :skPrefix)",
      {
        ":pk": { S: pk },
        ":skPrefix": { S: "SUB#" },
      }
    );

    users.push({
      id: userId,
      profile,
      subAccounts,
    });
  }

  return users;
}
