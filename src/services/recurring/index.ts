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
    {
      ":pk": { S: pk },
      ":skPrefix": { S: "BUDGET#" },
      ":isRecurring": { B: true },
    },
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
    {
      ":pk": { S: pk },
      ":skPrefix": { S: "EXPENSE#" },
      ":isRecurring": { B: true },
    },
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

  console.log("🚀 Starting recurring data processing for user:", {
    userId,
    totalSubAccounts: subAccountIds.length,
  });

  // 🟢 MAIN USER LEVEL
  console.log("📘 Fetching main recurring budgets for user:", userId);
  const mainBudgets = await getRecurringBudgets(dbService, userId);
  console.log("✅ Main recurring budgets fetched:", {
    count: mainBudgets.length,
  });

  console.log("🧮 Generating next month’s recurring budgets for main account");
  const mainBudgetInstances = generateNextMonthRecurringBudgets(mainBudgets);
  console.log("✅ Generated new budget instances:", {
    count: mainBudgetInstances.length,
  });

  console.log("💾 Saving main budget instances to DB");
  const savedMainBudgets = await saveBudgetInstancesToDb(
    dbService,
    mainBudgetInstances
  );
  console.log("✅ Saved main budgets:", { count: savedMainBudgets.length });

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
    const recurringBudgets = await getRecurringBudgets(dbService, userId, subId);
    console.log(`✅ Budgets fetched for sub-account ${subId}:`, {
      count: recurringBudgets.length,
    });

    console.log(`🧮 Generating next month’s budgets for sub-account ${subId}`);
    const budgetInstances = generateNextMonthRecurringBudgets(recurringBudgets);
    console.log(`✅ Generated new budget instances for ${subId}:`, {
      count: budgetInstances.length,
    });

    console.log(`💾 Saving budget instances for sub-account ${subId}`);
    const savedBudgets = await saveBudgetInstancesToDb(
      dbService,
      budgetInstances
    );
    console.log(`✅ Saved ${savedBudgets.length} budgets for sub-account ${subId}`);

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
    console.log(`✅ Created ${newExpenses.length} recurring expenses for ${subId}`);

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

  console.log({ profiles });

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

    console.log({
      subAccounts,
    });

    users.push({
      id: userId,
      profile,
      subAccounts,
    });
  }

  return users;
}
