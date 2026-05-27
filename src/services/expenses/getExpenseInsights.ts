import { Budget } from "../../domain/models/budget";
import { Expense } from "../../domain/models/expense";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { successResponse } from "../../utils/response";
import { DbService } from "../shared/dbService";

type GetExpenseInsights = {
  dbService: DbService;
  userId: string;
  subAccountId?: string;
};

type InsightSeverity = "info" | "success" | "warning" | "danger";

type Insight = {
  id: string;
  type: "summary" | "category" | "budget" | "unusual" | "recurring";
  severity: InsightSeverity;
  title: string;
  message: string;
  value?: number;
  category?: string;
  budgetId?: string;
  expenseId?: string;
};

export const getExpenseInsights = async ({
  dbService,
  userId,
  subAccountId,
}: GetExpenseInsights) => {
  const [expenseItems, budgetItems] = await Promise.all([
    dbService.queryItems(
      "dateGsiPk = :user AND dateGsiSk BETWEEN :from AND :to",
      {
        ":user": { S: createPk(userId, subAccountId) },
        ":from": { S: createDateRangeKey("EXPENSE", getTwoMonthStart()) },
        ":to": { S: createDateRangeKey("EXPENSE", getCurrentMonthEnd(), true) },
      },
      undefined,
      "UserItemsByDateIndex"
    ),
    dbService.queryItems(
      "dateGsiPk = :user AND dateGsiSk BETWEEN :from AND :to",
      {
        ":user": { S: createPk(userId, subAccountId) },
        ":from": { S: createDateRangeKey("BUDGET", getTwoMonthStart()) },
        ":to": { S: createDateRangeKey("BUDGET", getCurrentMonthEnd(), true) },
      },
      undefined,
      "UserItemsByDateIndex"
    ),
  ]);

  const expenses = expenseItems.map(formatDbItem) as Expense[];
  const budgets = budgetItems.map(formatDbItem) as Budget[];
  const activeExpenses = expenses.filter((expense) => !expense.upcoming);

  const now = new Date();
  const currentPeriod = getMonthPeriod(now);
  const previousPeriod = getMonthPeriod(
    new Date(now.getFullYear(), now.getMonth() - 1, 1)
  );

  const currentExpenses = activeExpenses.filter((expense) =>
    isInPeriod(expense.updatedAt, currentPeriod)
  );
  const previousExpenses = activeExpenses.filter((expense) =>
    isInPeriod(expense.updatedAt, previousPeriod)
  );
  const currentBudgets = budgets.filter((budget) =>
    isInPeriod(budget.updatedAt, currentPeriod)
  );

  const currentTotal = sumAmounts(currentExpenses);
  const previousTotal = sumAmounts(previousExpenses);
  const budgetTotal = sumAmounts(currentBudgets);
  const currency = currentExpenses[0]?.currency ?? budgets[0]?.currency ?? "EUR";

  const categoryBreakdown = sortEntries(groupTotalBy(currentExpenses, "category"))
    .slice(0, 5)
    .map(([category, amount]) => ({
      category: category || "Uncategorised",
      amount,
      percent: currentTotal ? Math.round((amount / currentTotal) * 100) : 0,
    }));

  const insights = [
    ...buildSummaryInsights(currentTotal, previousTotal, currency),
    ...buildCategoryInsights(currentExpenses, previousExpenses, currentTotal),
    ...buildBudgetInsights(currentExpenses, currentBudgets),
    ...buildUnusualInsights(activeExpenses, currentExpenses),
    ...buildRecurringInsights(activeExpenses),
  ].slice(0, 8);

  return successResponse({
    generatedAt: new Date().toISOString(),
    currency,
    period: {
      current: currentPeriod.label,
      previous: previousPeriod.label,
    },
    totals: {
      currentMonth: roundMoney(currentTotal),
      previousMonth: roundMoney(previousTotal),
      currentBudget: roundMoney(budgetTotal),
      remainingBudget: roundMoney(budgetTotal - currentTotal),
      changePercent: percentChange(previousTotal, currentTotal),
    },
    categories: categoryBreakdown.map((item) => ({
      ...item,
      amount: roundMoney(item.amount),
    })),
    insights,
  });
};

function buildSummaryInsights(
  currentTotal: number,
  previousTotal: number,
  currency: string
): Insight[] {
  if (!currentTotal && !previousTotal) {
    return [
      {
        id: "summary-empty",
        type: "summary",
        severity: "info",
        title: "No spending pattern yet",
        message: "Add expenses this month to start seeing useful insights.",
      },
    ];
  }

  const change = percentChange(previousTotal, currentTotal);
  if (change === null) {
    return [
      {
        id: "summary-first-month",
        type: "summary",
        severity: "info",
        title: "First month tracked",
        message: `You have tracked ${formatMoney(currentTotal, currency)} so far this month.`,
        value: roundMoney(currentTotal),
      },
    ];
  }

  const direction = change >= 0 ? "higher" : "lower";
  const severity: InsightSeverity =
    change >= 25 ? "warning" : change <= -15 ? "success" : "info";

  return [
    {
      id: "summary-month-change",
      type: "summary",
      severity,
      title: "Month-over-month spending",
      message: `You spent ${Math.abs(change)}% ${direction} than last month.`,
      value: roundMoney(currentTotal),
    },
  ];
}

function buildCategoryInsights(
  currentExpenses: Expense[],
  previousExpenses: Expense[],
  currentTotal: number
): Insight[] {
  const currentByCategory = groupTotalBy(currentExpenses, "category");
  const previousByCategory = groupTotalBy(previousExpenses, "category");
  const top = sortEntries(currentByCategory)[0];
  const biggestIncrease = sortEntriesByDelta(
    currentByCategory,
    previousByCategory
  )[0];

  const insights: Insight[] = [];

  if (top && currentTotal > 0) {
    const [category, amount] = top;
    insights.push({
      id: `category-top-${slug(category)}`,
      type: "category",
      severity: amount / currentTotal > 0.5 ? "warning" : "info",
      title: "Top spending category",
      message: `${category || "Uncategorised"} is your biggest category at ${Math.round(
        (amount / currentTotal) * 100
      )}% of this month's spending.`,
      value: roundMoney(amount),
      category: category || "Uncategorised",
    });
  }

  if (biggestIncrease && biggestIncrease.delta > 0) {
    insights.push({
      id: `category-increase-${slug(biggestIncrease.category)}`,
      type: "category",
      severity: biggestIncrease.delta > 100 ? "warning" : "info",
      title: "Biggest category increase",
      message: `${biggestIncrease.category || "Uncategorised"} increased by ${roundMoney(
        biggestIncrease.delta
      )} compared with last month.`,
      value: roundMoney(biggestIncrease.delta),
      category: biggestIncrease.category || "Uncategorised",
    });
  }

  return insights;
}

function buildBudgetInsights(expenses: Expense[], budgets: Budget[]): Insight[] {
  return budgets
    .map((budget) => {
      const spent = sumAmounts(
        expenses.filter((expense) =>
          budget.id
            ? expense.budgetId === budget.id
            : expense.category === budget.category
        )
      );
      const percent = budget.amount ? (spent / budget.amount) * 100 : 0;
      return { budget, spent, percent };
    })
    .filter(({ spent, percent }) => spent > 0 && percent >= 80)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 2)
    .map(({ budget, spent, percent }) => ({
      id: `budget-risk-${budget.id}`,
      type: "budget",
      severity: percent >= 100 ? "danger" : "warning",
      title: percent >= 100 ? "Budget exceeded" : "Budget nearly used",
      message: `${budget.title} is at ${Math.round(percent)}% used.`,
      value: roundMoney(spent),
      category: budget.category,
      budgetId: budget.id,
    }));
}

function buildUnusualInsights(
  allExpenses: Expense[],
  currentExpenses: Expense[]
): Insight[] {
  const byCategory = groupExpensesByCategory(allExpenses);

  return currentExpenses
    .map((expense) => {
      const categoryExpenses = byCategory.get(normalizeCategory(expense.category)) ?? [];
      const peers = categoryExpenses.filter((item) => item.id !== expense.id);
      const average = peers.length ? sumAmounts(peers) / peers.length : 0;
      return { expense, average };
    })
    .filter(
      ({ expense, average }) =>
        average >= 10 && expense.amount >= average * 2 && expense.amount >= 25
    )
    .sort((a, b) => b.expense.amount / b.average - a.expense.amount / a.average)
    .slice(0, 2)
    .map(({ expense, average }) => ({
      id: `unusual-${expense.id}`,
      type: "unusual",
      severity: "warning",
      title: "Unusual expense",
      message: `${expense.title} is about ${Math.round(
        expense.amount / average
      )}x your usual ${expense.category || "uncategorised"} spend.`,
      value: roundMoney(expense.amount),
      category: expense.category,
      expenseId: expense.id,
    }));
}

function buildRecurringInsights(expenses: Expense[]): Insight[] {
  const recurringCandidates = new Map<string, Expense[]>();

  for (const expense of expenses) {
    if (expense.isRecurring) continue;
    const key = `${normalizeText(expense.title)}|${normalizeCategory(
      expense.category
    )}`;
    const group = recurringCandidates.get(key) ?? [];
    group.push(expense);
    recurringCandidates.set(key, group);
  }

  return Array.from(recurringCandidates.values())
    .filter((items) => {
      const months = new Set(
        items.map((item) => new Date(item.updatedAt).toISOString().slice(0, 7))
      );
      return months.size >= 2;
    })
    .slice(0, 1)
    .map((items) => ({
      id: `recurring-${slug(items[0].title)}`,
      type: "recurring",
      severity: "info",
      title: "Possible recurring expense",
      message: `${items[0].title} appears in both recent months. You may want to mark it as recurring.`,
      value: roundMoney(items[0].amount),
      category: items[0].category,
      expenseId: items[0].id,
    }));
}

function getMonthPeriod(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return {
    start,
    end,
    label: start.toISOString().slice(0, 7),
  };
}

function getTwoMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

function getCurrentMonthEnd() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0);
}

function createDateRangeKey(
  type: "EXPENSE" | "BUDGET",
  date: Date,
  endOfDay = false
) {
  const isoDate = date.toISOString().slice(0, 10);
  return `${type}#${isoDate}${endOfDay ? "~" : ""}`;
}

function isInPeriod(value: string | undefined, period: ReturnType<typeof getMonthPeriod>) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= period.start && date < period.end;
}

function sumAmounts(items: { amount: number }[]) {
  return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function groupTotalBy<T extends { amount: number }>(
  items: T[],
  key: keyof T
) {
  return items.reduce((map, item) => {
    const group = String(item[key] || "Uncategorised");
    map.set(group, (map.get(group) ?? 0) + Number(item.amount || 0));
    return map;
  }, new Map<string, number>());
}

function groupExpensesByCategory(expenses: Expense[]) {
  return expenses.reduce((map, expense) => {
    const key = normalizeCategory(expense.category);
    const group = map.get(key) ?? [];
    group.push(expense);
    map.set(key, group);
    return map;
  }, new Map<string, Expense[]>());
}

function sortEntries(map: Map<string, number>) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

function sortEntriesByDelta(
  current: Map<string, number>,
  previous: Map<string, number>
) {
  return Array.from(current.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      delta: amount - (previous.get(category) ?? 0),
    }))
    .sort((a, b) => b.delta - a.delta);
}

function percentChange(previous: number, current: number) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeCategory(value: string | undefined) {
  return normalizeText(value || "Uncategorised");
}

function slug(value: string | undefined) {
  return normalizeText(value || "uncategorised").replace(/[^a-z0-9]+/g, "-");
}
