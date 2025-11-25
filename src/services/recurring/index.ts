import {
  addMonths,
  parseISO,
  isSameDay,
  differenceInCalendarMonths,
  formatISO,
  subMonths,
} from "date-fns";
import { Budget } from "../../domain/models/budget";
import { Expense } from "../../domain/models/expense";
import { DbService } from "../shared/dbService";
import { createBudgetOnly } from "../budgets/createBudget";
import { createExpenses } from "../expenses/createExpenses";
import { createExpensesPk, createPk } from "../../utils/createPk";
import { User } from "../../domain/models/user";

/* ---------------------------------------------------------
   1️⃣  Generate Next-Month Budgets
   → Only create if last updated date is exactly 1 month behind today (same day)
--------------------------------------------------------- */
export function generateNextMonthRecurringBudgets(
  recurringBudgets: Budget[]
): Budget[] {
  const today = new Date();

  return recurringBudgets
    .filter((budget) => {
      if (!budget.isRecurring) return false;
      const lastUpdated = parseISO(budget.updatedAt);
      const monthDiff = differenceInCalendarMonths(today, lastUpdated);
      return monthDiff === 1 && isSameDay(today, addMonths(lastUpdated, 1));
    })
    .map((budget) => ({
      ...budget,
      oldBudgetId: budget.id,
      updatedAt: addMonths(parseISO(budget.updatedAt), 1)
        .toISOString()
        .split("T")[0],
      subAccountId: budget.subAccountId ?? undefined,
      userId: budget.userId, // ✅ ensure userId remains
    }));
}

/* ---------------------------------------------------------
   2️⃣  Generate Next-Month Expenses (linked to new budgets)
   → Same date rule applies to recurring expenses
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

    console.log({
      recurringExpenses,
    });

    const newExpenseInstances = recurringExpenses
      .filter((e) => {
        if (!e.isRecurring) return false;
        const lastUpdated = parseISO(e.updatedAt);

        // Normalize both to date-only strings to avoid timezone mismatches
        const todayDate = formatISO(today, { representation: "date" });
        const nextMonthDate = formatISO(addMonths(lastUpdated, 1), {
          representation: "date",
        });

        const monthDiff = differenceInCalendarMonths(today, lastUpdated);
        const isExactDateMatch = todayDate === nextMonthDate;

        return monthDiff === 1 && isExactDateMatch;
      })
      .map((expense) => ({
        ...expense,
        updatedAt: addMonths(parseISO(expense.updatedAt), 1)
          .toISOString()
          .split("T")[0],
        budgetId: newBudgetId,
        // Ensure all required fields are present
        id: expense.id,
        title: expense.title,
        amount: expense.amount,
        currency: expense.currency,
        upcoming: expense.upcoming,
        favorite: expense.favorite,
        isRecurring: expense.isRecurring,
        description: expense.description,
        userId: expense.userId,
        category: expense.category,
        subAccountId: expense.subAccountId,
      }));

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
   3️⃣  DB Queries — Dynamic `updatedAt` filtering
   → Only fetch items where `updatedAt` equals cutoff date (1 month ago)
--------------------------------------------------------- */
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

/* ---------------------------------------------------------
   4️⃣  Run for One User (Budgets + Expenses)
--------------------------------------------------------- */
export async function processRecurringDataForUser(
  dbService: DbService,
  user: User
) {
  const userId = user.id;
  const subAccountIds = user.subAccounts?.map((s) => s.subAccountId) ?? [];
  const allResults: any[] = [];

  // 🟢 MAIN USER LEVEL
  const mainBudgets = await getRecurringBudgets(dbService, userId);

  const mainBudgetInstances = generateNextMonthRecurringBudgets(
    mainBudgets as Budget[]
  );

  const savedMainBudgets = await saveBudgetInstancesToDb(
    dbService,
    mainBudgetInstances
  );

  const mainBudgetMap = Object.fromEntries(
    savedMainBudgets.map((b: any) => [b.oldBudgetId, b.id])
  );
  console.log("🗺️ Main budget old→new ID map created:", mainBudgetMap);

  console.log("💰 Generating recurring expenses for main budgets");
  const mainExpenses = await generateRecurringExpensesForNewBudgets(
    dbService,
    mainBudgetMap,
    userId
  );
  console.log("✅ Main recurring expenses created:", {
    count: mainExpenses.length,
  });

  allResults.push({
    scope: "main",
    budgetsCreated: savedMainBudgets.length,
    expensesCreated: mainExpenses.length,
  });

  // 🟣 SUB-ACCOUNT LEVEL
  for (const subId of subAccountIds) {
    console.log(`📘 Fetching recurring budgets for sub-account ${subId}`);
    const recurringBudgets = await getRecurringBudgets(
      dbService,
      userId,
      subId
    );
    console.log(`✅ Budgets fetched for sub-account ${subId}:`, {
      recurringBudgets,
    });

    console.log(`🧮 Generating next month’s budgets for sub-account ${subId}`);
    const budgetInstances = generateNextMonthRecurringBudgets(
      recurringBudgets as Budget[]
    );
    console.log(`✅ Generated new budget instances for ${subId}:`, {
      budgetInstances,
    });

    const scopedInstances = budgetInstances.map((b) => ({
      ...b,
      subAccountId: b.subAccountId ?? subId,
      userId: b.userId ?? userId,
    }));

    console.log(`✅ Generated new budget instances for ${subId}:`, {
      scopedInstances,
    });

    console.log(`💾 Saving budget instances for sub-account ${subId}`);
    const savedBudgets = await saveBudgetInstancesToDb(
      dbService,
      scopedInstances
    );
    console.log(
      `✅ Saved ${savedBudgets.length} budgets for sub-account ${subId}`
    );

    const budgetMap = Object.fromEntries(
      savedBudgets.map((b: any) => [b.oldBudgetId, b.id])
    );
    console.log(`🗺️ Budget map for sub-account ${subId}:`, budgetMap);

    console.log(`💰 Generating recurring expenses for sub-account ${subId}`);
    const newExpenses = await generateRecurringExpensesForNewBudgets(
      dbService,
      budgetMap,
      userId,
      subId
    );
    console.log(
      `✅ Created ${newExpenses.length} recurring expenses for ${subId}`
    );

    allResults.push({
      scope: subId,
      budgetsCreated: savedBudgets.length,
      expensesCreated: newExpenses.length,
    });
  }

  console.log("🎯 Recurring job summary:", allResults);
  console.log("✅ Recurring data processing completed for user:", userId);

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

    console.log({
      result,
    });
    report.push({ userId: (user as User).id, details: result });
  }

  console.log(
    "✅ Monthly recurring budgets & expenses processed:",
    JSON.stringify(report, null, 2)
  );
  return report;
}

async function getAllUsersWithSubAccounts(dbService: DbService) {
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
