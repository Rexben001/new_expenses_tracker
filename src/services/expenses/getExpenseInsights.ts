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

type Period = {
  start: Date;
  end: Date;
  label: string;
};

type InsightSeverity = "info" | "success" | "warning" | "danger";

type Insight = {
  id: string;
  type:
    | "summary"
    | "category"
    | "budget"
    | "unusual"
    | "recurring"
    | "projection"
    | "merchant"
    | "duplicate";
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
  const budgetStartDay = await getBudgetStartDay({
    dbService,
    userId,
    subAccountId,
  });
  const periods = getBudgetPeriods(new Date(), budgetStartDay);

  const [expenseItems, budgetItems] = await Promise.all([
    dbService.queryItems(
      "dateGsiPk = :user AND dateGsiSk BETWEEN :from AND :to",
      {
        ":user": { S: createPk(userId, subAccountId) },
        ":from": { S: createDateRangeKey("EXPENSE", periods.previous.start) },
        ":to": { S: createDateRangeKey("EXPENSE", periods.current.end, true) },
      },
      undefined,
      "UserItemsByDateIndex"
    ),
    dbService.queryItems(
      "dateGsiPk = :user AND dateGsiSk BETWEEN :from AND :to",
      {
        ":user": { S: createPk(userId, subAccountId) },
        ":from": { S: createDateRangeKey("BUDGET", periods.previous.start) },
        ":to": { S: createDateRangeKey("BUDGET", periods.current.end, true) },
      },
      undefined,
      "UserItemsByDateIndex"
    ),
  ]);

  const expenses = expenseItems.map(formatDbItem) as Expense[];
  const budgets = budgetItems.map(formatDbItem) as Budget[];
  const activeExpenses = expenses.filter((expense) => !expense.upcoming);

  const currentExpenses = activeExpenses.filter((expense) =>
    isInPeriod(expense.updatedAt, periods.current)
  );
  const previousExpenses = activeExpenses.filter((expense) =>
    isInPeriod(expense.updatedAt, periods.previous)
  );
  const currentBudgets = budgets.filter((budget) =>
    isInPeriod(budget.updatedAt, periods.current)
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
    ...buildProjectionInsights(currentTotal, budgetTotal, periods.current, currency),
    ...buildCategoryInsights(currentExpenses, previousExpenses, currentTotal),
    ...buildBudgetInsights(currentExpenses, currentBudgets, periods.current),
    ...buildMerchantInsights(currentExpenses),
    ...buildDuplicateInsights(currentExpenses),
    ...buildUnusualInsights(activeExpenses, currentExpenses),
    ...buildRecurringInsights(activeExpenses),
  ].slice(0, 8);

  return successResponse({
    generatedAt: new Date().toISOString(),
    currency,
    period: {
      current: periods.current.label,
      previous: periods.previous.label,
      budgetStartDay,
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

function buildProjectionInsights(
  currentTotal: number,
  budgetTotal: number,
  period: Period,
  currency: string
): Insight[] {
  if (!currentTotal) return [];

  const elapsed = getElapsedDays(period);
  const totalDays = getPeriodDays(period);
  const projected = (currentTotal / elapsed) * totalDays;

  if (!Number.isFinite(projected) || projected <= currentTotal) return [];

  const overBudget = budgetTotal > 0 && projected > budgetTotal;
  const difference = Math.abs(projected - budgetTotal);

  return [
    {
      id: "projection-period-end",
      type: "projection",
      severity: overBudget ? "warning" : "info",
      title: "Projected spending",
      message: overBudget
        ? `At this pace, you may exceed your budget by ${formatMoney(
            difference,
            currency
          )}.`
        : `At this pace, you may spend ${formatMoney(
            projected,
            currency
          )} by the end of this budget cycle.`,
      value: roundMoney(projected),
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

function buildBudgetInsights(
  expenses: Expense[],
  budgets: Budget[],
  period: Period
): Insight[] {
  const expectedPercent = getElapsedPercent(period);

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
      return {
        budget,
        spent,
        percent,
        aheadBy: percent - expectedPercent,
      };
    })
    .filter(
      ({ spent, percent, aheadBy }) =>
        spent > 0 && (percent >= 80 || aheadBy >= 20)
    )
    .sort((a, b) => b.aheadBy - a.aheadBy || b.percent - a.percent)
    .slice(0, 2)
    .map(({ budget, spent, percent, aheadBy }) => {
      const severity: InsightSeverity = percent >= 100 ? "danger" : "warning";

      return {
        id: `budget-risk-${budget.id}`,
        type: "budget",
        severity,
        title: percent >= 100 ? "Budget exceeded" : "Budget pace risk",
        message:
          percent >= 100
            ? `${budget.title} is already over budget.`
            : `${budget.title} is ${Math.round(
                aheadBy
              )}% ahead of the expected pace for this budget cycle.`,
        value: roundMoney(spent),
        category: budget.category,
        budgetId: budget.id,
      };
    });
}

function buildMerchantInsights(expenses: Expense[]): Insight[] {
  const groups = groupExpensesByTitle(expenses);
  const top = Array.from(groups.values())
    .map((items) => ({
      title: items[0].title,
      total: sumAmounts(items),
      count: items.length,
    }))
    .filter(({ title, total, count }) => title && count >= 2 && total >= 20)
    .sort((a, b) => b.total - a.total)[0];

  if (!top) return [];

  return [
    {
      id: `merchant-top-${slug(top.title)}`,
      type: "merchant",
      severity: "info",
      title: "Frequent merchant",
      message: `${top.title} appears ${top.count} times this cycle and is your top repeated merchant.`,
      value: roundMoney(top.total),
    },
  ];
}

function buildDuplicateInsights(expenses: Expense[]): Insight[] {
  const groups = groupExpensesByTitle(expenses);

  const duplicate = Array.from(groups.values())
    .flatMap((items) => findSimilarAmountPairs(items))
    .sort((a, b) => b.amount - a.amount)[0];

  if (!duplicate) return [];

  return [
    {
      id: `duplicate-${duplicate.id}`,
      type: "duplicate",
      severity: "warning",
      title: "Possible duplicate expense",
      message: `${duplicate.title} has another entry with a very similar amount this cycle.`,
      value: roundMoney(duplicate.amount),
      expenseId: duplicate.id,
      category: duplicate.category,
    },
  ];
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

function createDateRangeKey(
  type: "EXPENSE" | "BUDGET",
  date: Date,
  endOfDay = false
) {
  const isoDate = date.toISOString().slice(0, 10);
  return `${type}#${isoDate}${endOfDay ? "~" : ""}`;
}

async function getBudgetStartDay({
  dbService,
  userId,
  subAccountId,
}: GetExpenseInsights) {
  const pk = createPk(userId);
  const profileKey = {
    ":pk": { S: pk },
    ":sk": { S: `PROFILE#${userId}` },
  };
  const subKey = subAccountId
    ? {
        ":pk": { S: pk },
        ":sk": { S: `SUB#${subAccountId}` },
      }
    : undefined;

  const [profileItems, subItems] = await Promise.all([
    dbService.queryItems("PK = :pk AND SK = :sk", profileKey),
    subKey
      ? dbService.queryItems("PK = :pk AND SK = :sk", subKey)
      : Promise.resolve([]),
  ]);

  const rawDay =
    subItems[0]?.budgetStartDay ?? profileItems[0]?.budgetStartDay ?? 1;
  const day = Number(rawDay);

  if (!Number.isFinite(day)) return 1;
  return Math.min(Math.max(Math.trunc(day), 1), 28);
}

function getBudgetPeriods(now: Date, budgetStartDay: number) {
  const currentStart =
    now.getDate() >= budgetStartDay
      ? new Date(now.getFullYear(), now.getMonth(), budgetStartDay)
      : new Date(now.getFullYear(), now.getMonth() - 1, budgetStartDay);
  const currentEnd = new Date(
    currentStart.getFullYear(),
    currentStart.getMonth() + 1,
    budgetStartDay
  );
  const previousStart = new Date(
    currentStart.getFullYear(),
    currentStart.getMonth() - 1,
    budgetStartDay
  );

  return {
    current: createPeriod(currentStart, currentEnd),
    previous: createPeriod(previousStart, currentStart),
  };
}

function createPeriod(start: Date, end: Date): Period {
  const startLabel = start.toISOString().slice(0, 10);
  const endLabel = new Date(end.getTime() - 1).toISOString().slice(0, 10);

  return {
    start,
    end,
    label: `${startLabel} to ${endLabel}`,
  };
}

function isInPeriod(value: string | undefined, period: Period) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= period.start && date < period.end;
}

function getPeriodDays(period: Period) {
  return Math.max(1, Math.ceil((period.end.getTime() - period.start.getTime()) / 86400000));
}

function getElapsedDays(period: Period) {
  const now = new Date();
  const elapsedMs = Math.min(
    Math.max(now.getTime() - period.start.getTime(), 0),
    period.end.getTime() - period.start.getTime()
  );
  return Math.max(1, Math.ceil(elapsedMs / 86400000));
}

function getElapsedPercent(period: Period) {
  return (getElapsedDays(period) / getPeriodDays(period)) * 100;
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

function groupExpensesByTitle(expenses: Expense[]) {
  return expenses.reduce((map, expense) => {
    const key = normalizeText(expense.title);
    if (!key) return map;

    const group = map.get(key) ?? [];
    group.push(expense);
    map.set(key, group);
    return map;
  }, new Map<string, Expense[]>());
}

function findSimilarAmountPairs(items: Expense[]) {
  const matches: Expense[] = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const first = items[i];
      const second = items[j];
      const diff = Math.abs(first.amount - second.amount);
      const tolerance = Math.max(1, Math.min(first.amount, second.amount) * 0.05);

      if (diff <= tolerance) {
        matches.push(first.amount >= second.amount ? first : second);
      }
    }
  }

  return matches;
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
