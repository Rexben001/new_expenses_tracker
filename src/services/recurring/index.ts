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
import {
  getRecurringExpensesForBudget,
  getRecurringBudgets,
  saveBudgetInstancesToDb,
  getAllUsersWithSubAccounts,
} from "./dbQuery";
import { logger } from "../../utils/logger";

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
      title: budget.title.endsWith(" (copy)")
        ? budget.title
        : `${budget.title} (copy)`,
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
        title: expense.title.endsWith(" (copy)")
          ? expense.title
          : `${expense.title} (copy)`,
        amount: expense.amount,
        currency: expense.currency,
        upcoming: true,
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
  logger.info("Main budget old-to-new ID map created", { mainBudgetMap });

  logger.info("Generating recurring expenses for main budgets");
  const mainExpenses = await generateRecurringExpensesForNewBudgets(
    dbService,
    mainBudgetMap,
    userId
  );
  logger.info("Main recurring expenses created", {
    count: mainExpenses.length,
  });

  allResults.push({
    scope: "main",
    budgetsCreated: savedMainBudgets.length,
    expensesCreated: mainExpenses.length,
  });

  // 🟣 SUB-ACCOUNT LEVEL
  for (const subId of subAccountIds) {
    logger.info("Fetching recurring budgets for sub-account", { subId });
    const recurringBudgets = await getRecurringBudgets(
      dbService,
      userId,
      subId
    );
    logger.info("Budgets fetched for sub-account", {
      subId,
      count: recurringBudgets.length,
    });

    logger.info("Generating next month budgets for sub-account", { subId });
    const budgetInstances = generateNextMonthRecurringBudgets(
      recurringBudgets as Budget[]
    );
    logger.info("Generated new budget instances for sub-account", {
      subId,
      count: budgetInstances.length,
    });

    const scopedInstances = budgetInstances.map((b) => ({
      ...b,
      subAccountId: b.subAccountId ?? subId,
      userId: b.userId ?? userId,
      title: b.title.endsWith(" (copy)") ? b.title : `${b.title} (copy)`,
    }));

    logger.info("Generated scoped budget instances for sub-account", {
      subId,
      count: scopedInstances.length,
    });

    logger.info("Saving budget instances for sub-account", { subId });
    const savedBudgets = await saveBudgetInstancesToDb(
      dbService,
      scopedInstances
    );
    logger.info("Saved budgets for sub-account", {
      subId,
      count: savedBudgets.length,
    });

    const budgetMap = Object.fromEntries(
      savedBudgets.map((b: any) => [b.oldBudgetId, b.id])
    );
    logger.info("Budget map created for sub-account", { subId, budgetMap });

    logger.info("Generating recurring expenses for sub-account", { subId });
    const newExpenses = await generateRecurringExpensesForNewBudgets(
      dbService,
      budgetMap,
      userId,
      subId
    );
    logger.info("Created recurring expenses for sub-account", {
      subId,
      count: newExpenses.length,
    });

    allResults.push({
      scope: subId,
      budgetsCreated: savedBudgets.length,
      expensesCreated: newExpenses.length,
    });
  }

  logger.info("Recurring job summary for user", { userId, allResults });
  logger.info("Recurring data processing completed for user", { userId });

  return allResults;
}

/* ---------------------------------------------------------
   5️⃣  Orchestrate for All Users (Nightly Cron)
--------------------------------------------------------- */
export async function processMonthlyRecurringJob(dbService: DbService) {
  const users = await getAllUsersWithSubAccounts(dbService);
  const report: any[] = [];

  logger.info("Processing monthly recurring job users", {
    userCount: users.length,
  });

  for (const user of users) {
    const result = await processRecurringDataForUser(dbService, user as User);

    report.push({ userId: (user as User).id, details: result });
  }

  logger.info("Monthly recurring budgets and expenses processed", {
    usersProcessed: report.length,
  });
  return report;
}
