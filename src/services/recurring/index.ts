import { addMonths, parseISO, isSameMonth } from "date-fns";
import { Budget } from "../../domain/models/budget";
import { Expense } from "../../domain/models/expense";
import { DbService } from "../shared/dbService";
import { createBudgetOnly } from "../budgets/createBudget";
import { createExpenses } from "../expenses/createExpenses";
import { createPk } from "../../utils/createPk";
import { User } from "../../domain/models/user";

/* ---------------------------------------------------------
   1️⃣  Generate Next-Month Budgets
--------------------------------------------------------- */
export function generateNextMonthRecurringBudgets(
  recurringBudgets: Budget[]
): Budget[] {
  const today = new Date();
  return recurringBudgets
    .filter((budget) => budget.isRecurring)
    .map((budget) => {
      const lastUpdated = parseISO(budget.updatedAt);
      const nextMonth = addMonths(lastUpdated, 1);
      if (isSameMonth(nextMonth, today)) {
        return {
          ...budget,
          updatedAt: nextMonth.toISOString(),
          oldBudgetId: budget.id,
        };
      }
      return null;
    })
    .filter(Boolean) as Budget[];
}

/* ---------------------------------------------------------
   2️⃣  Generate Next-Month Expenses (linked to new budgets)
--------------------------------------------------------- */
export async function generateRecurringExpensesForNewBudgets(
  dbService: DbService,
  oldToNewBudgetMap: Record<string, string>,
  userId: string,
  subAccountId?: string
) {
  const today = new Date();
  const allNewExpenses: Expense[] = [];

  for (const [oldBudgetId, newBudgetId] of Object.entries(oldToNewBudgetMap)) {
    const recurringExpenses = await getRecurringExpensesForBudget(
      dbService,
      userId,
      oldBudgetId,
      subAccountId
    );

    const newExpenseInstances = recurringExpenses
      .filter((e) => e.isRecurring)
      .map((expense) => {
        const lastUpdated = parseISO(expense.updatedAt);
        const nextMonth = addMonths(lastUpdated, 1);

        if (isSameMonth(nextMonth, today)) {
          return {
            ...expense,
            updatedAt: nextMonth.toISOString(),
            budgetId: newBudgetId, // ✅ Link to new budget
          };
        }
        return null;
      })
      .filter(Boolean) as Expense[];

    await Promise.all(
      newExpenseInstances.map((expense) =>
        createExpenses({
          dbService,
          body: JSON.stringify(expense),
          userId,
          subAccountId,
          budgetId: expense.budgetId,
        })
      )
    );

    allNewExpenses.push(...newExpenseInstances);
  }

  return allNewExpenses;
}

/* ---------------------------------------------------------
   3️⃣  DB Helpers
--------------------------------------------------------- */
export const getRecurringBudgets = async (
  dbService: DbService,
  userId: string,
  subAccountId?: string
) => {
  const pk = createPk(userId, subAccountId);
  return dbService.queryItems(
    "PK = :pk AND begins_with(SK, :skPrefix)",
    { ":pk": pk, ":skPrefix": "BUDGET#", ":isRecurring": true },
    "isRecurring = :isRecurring"
  );
};

export const getRecurringExpensesForBudget = async (
  dbService: DbService,
  userId: string,
  budgetId: string,
  subAccountId?: string
) => {
  const pk = `USER#${userId}${
    subAccountId ? `#SUB#${subAccountId}` : ""
  }#BUDGET#${budgetId}`;
  return dbService.queryItems(
    "PK = :pk AND begins_with(SK, :skPrefix)",
    { ":pk": pk, ":skPrefix": "EXPENSE#", ":isRecurring": true },
    "isRecurring = :isRecurring"
  );
};

async function saveBudgetInstancesToDb(
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

async function getAllUsers(dbService: DbService) {
  return dbService.queryItems("begins_with(PK, :pkPrefix) AND SK = :sk", {
    ":pkPrefix": { S: "USER#" },
    ":sk": { S: "PROFILE#" },
  });
}

/* ---------------------------------------------------------
   4️⃣  Run for One User (Budgets + Expenses)
--------------------------------------------------------- */
export async function processRecurringDataForUser(
  dbService: DbService,
  user: User
) {
  const userId = user.id;
  const subAccountIds = user.subAccounts?.map((s) => s.id) ?? [];
  const allResults: any[] = [];

  const accounts = [undefined, ...subAccountIds];

  for (const subId of accounts) {
    // Step 1: Get recurring budgets
    const recurringBudgets = await getRecurringBudgets(
      dbService,
      userId,
      subId
    );

    // Step 2: Generate and save next-month budgets
    const budgetInstances = generateNextMonthRecurringBudgets(
      recurringBudgets as Budget[]
    );
    const savedBudgets = await saveBudgetInstancesToDb(
      dbService,
      budgetInstances
    );

    // Step 3: Build old → new map
    const budgetMap = Object.fromEntries(
      savedBudgets.map((b: any) => [b.oldBudgetId, b.id])
    );

    // Step 4: Generate and save expenses linked to new budgets
    const newExpenses = await generateRecurringExpensesForNewBudgets(
      dbService,
      budgetMap,
      userId,
      subId
    );

    allResults.push({
      subId,
      newBudgets: savedBudgets.length,
      newExpenses: newExpenses.length,
    });
  }

  return allResults;
}

/* ---------------------------------------------------------
   5️⃣  Orchestrate for All Users (Nightly Cron)
--------------------------------------------------------- */
export async function processMonthlyRecurringJob(dbService: DbService) {
  const users = await getAllUsersWithSubAccounts(dbService);
  const report: any[] = [];

  console.log("users:", users);

  for (const user of users) {
    const result = await processRecurringDataForUser(dbService, user as User);
    report.push({ userId: (user as User).id, details: result });
  }

  console.log(
    "✅ Monthly recurring budgets & expenses processed:",
    JSON.stringify(report, null, 2)
  );
  return report;
}

async function getAllUsersWithSubAccounts(dbService: DbService) {
  // 1️⃣ Get all user profiles
  const profiles = await dbService.queryItems(
    "begins_with(PK, :pkPrefix) AND begins_with(SK, :sk)",
    {
      ":pkPrefix": { S: "USER#" },
      ":sk": { S: "PROFILE#" },
    }
  );

  console.log({ profiles });

  const users: any[] = [];

  // 2️⃣ For each profile, fetch its sub-accounts
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
      profile: profile,
      subAccounts,
    });
  }

  return users;
}
