import type { APIGatewayEvent, Context } from "aws-lambda";
import { makeHandler as makeBudgetHandler } from "../src/handlers/handleBudget/handler";
import { makeHandler as makeCalendarHandler } from "../src/handlers/handleCalendar/handler";
import { makeHandler as makeExpensesHandler } from "../src/handlers/handleExpenses/handler";
import { makeHandler as makeReceiptsHandler } from "../src/handlers/handleReceipts/handler";
import { makeHandler as makeTasksHandler } from "../src/handlers/handleTasks/handler";
import { makeHandler as makeUsersHandler } from "../src/handlers/handleUsers/handler";
import { createBudget } from "../src/services/budgets/createBudget";
import { deleteBudget } from "../src/services/budgets/deleteBudget";
import { duplicateBudget } from "../src/services/budgets/duplicateBudget";
import { getBudget } from "../src/services/budgets/getBudget";
import { updateBudgets } from "../src/services/budgets/updateBudget";
import { createCalendarEntry } from "../src/services/calendar/createCalendarEntry";
import { deleteCalendarEntry } from "../src/services/calendar/deleteCalendarEntry";
import { getCalendarEntries } from "../src/services/calendar/getCalendarEntries";
import { updateCalendarEntry } from "../src/services/calendar/updateCalendarEntry";
import { createExpenses } from "../src/services/expenses/createExpenses";
import { deleteExpenses } from "../src/services/expenses/deleteExpenses";
import { duplicateExpenses } from "../src/services/expenses/duplicateExpense";
import { getExpenseInsights } from "../src/services/expenses/getExpenseInsights";
import { getExpenses } from "../src/services/expenses/getExpenses";
import { updateExpenses } from "../src/services/expenses/updateExpenses";
import { analyzeReceiptImage } from "../src/services/receipts/analyzeReceipt";
import type { DbService } from "../src/services/shared/dbService";
import { createTask } from "../src/services/tasks/createTask";
import { deleteTask } from "../src/services/tasks/deleteTask";
import { getTasks } from "../src/services/tasks/getTasks";
import { updateTask } from "../src/services/tasks/updateTask";
import { createSubAccount } from "../src/services/users/createUser";
import { deleteSubAccount } from "../src/services/users/deleteSubAccount";
import { getUser } from "../src/services/users/getUser";
import { updateUser } from "../src/services/users/updateUser";

jest.mock("../src/utils/logger", () => ({
  createInvocationLogger: () => ({
    appendKeys: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    resetKeys: jest.fn(),
  }),
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock("../src/services/budgets/createBudget", () => ({
  createBudget: jest.fn(),
}));
jest.mock("../src/services/budgets/deleteBudget", () => ({
  deleteBudget: jest.fn(),
}));
jest.mock("../src/services/budgets/duplicateBudget", () => ({
  duplicateBudget: jest.fn(),
}));
jest.mock("../src/services/budgets/getBudget", () => ({
  getBudget: jest.fn(),
}));
jest.mock("../src/services/budgets/updateBudget", () => ({
  updateBudgets: jest.fn(),
}));
jest.mock("../src/services/calendar/createCalendarEntry", () => ({
  createCalendarEntry: jest.fn(),
}));
jest.mock("../src/services/calendar/deleteCalendarEntry", () => ({
  deleteCalendarEntry: jest.fn(),
}));
jest.mock("../src/services/calendar/getCalendarEntries", () => ({
  getCalendarEntries: jest.fn(),
}));
jest.mock("../src/services/calendar/updateCalendarEntry", () => ({
  updateCalendarEntry: jest.fn(),
}));
jest.mock("../src/services/expenses/createExpenses", () => ({
  createExpenses: jest.fn(),
}));
jest.mock("../src/services/expenses/deleteExpenses", () => ({
  deleteExpenses: jest.fn(),
}));
jest.mock("../src/services/expenses/duplicateExpense", () => ({
  duplicateExpenses: jest.fn(),
}));
jest.mock("../src/services/expenses/getExpenseInsights", () => ({
  getExpenseInsights: jest.fn(),
}));
jest.mock("../src/services/expenses/getExpenses", () => ({
  getExpenses: jest.fn(),
}));
jest.mock("../src/services/expenses/updateExpenses", () => ({
  updateExpenses: jest.fn(),
}));
jest.mock("../src/services/receipts/analyzeReceipt", () => ({
  analyzeReceiptImage: jest.fn(),
}));
jest.mock("../src/services/tasks/createTask", () => ({
  createTask: jest.fn(),
}));
jest.mock("../src/services/tasks/deleteTask", () => ({
  deleteTask: jest.fn(),
}));
jest.mock("../src/services/tasks/getTasks", () => ({
  getTasks: jest.fn(),
}));
jest.mock("../src/services/tasks/updateTask", () => ({
  updateTask: jest.fn(),
}));
jest.mock("../src/services/users/createUser", () => ({
  createSubAccount: jest.fn(),
  createUser: jest.fn(),
}));
jest.mock("../src/services/users/deleteSubAccount", () => ({
  deleteSubAccount: jest.fn(),
}));
jest.mock("../src/services/users/getUser", () => ({
  getUser: jest.fn(),
}));
jest.mock("../src/services/users/updateUser", () => ({
  updateUser: jest.fn(),
}));

const okResponse = {
  statusCode: 200,
  headers: {},
  body: JSON.stringify({ ok: true }),
};

const mockDbService = {} as DbService;
const mockContext = {} as Context;

const mockedServices = [
  createBudget,
  deleteBudget,
  duplicateBudget,
  getBudget,
  updateBudgets,
  createCalendarEntry,
  deleteCalendarEntry,
  getCalendarEntries,
  updateCalendarEntry,
  createExpenses,
  deleteExpenses,
  duplicateExpenses,
  getExpenseInsights,
  getExpenses,
  updateExpenses,
  analyzeReceiptImage,
  createTask,
  deleteTask,
  getTasks,
  updateTask,
  createSubAccount,
  deleteSubAccount,
  getUser,
  updateUser,
] as jest.MockedFunction<any>[];

function apiEvent({
  body = "",
  method,
  path,
  pathParameters = {},
  queryStringParameters = {},
}: {
  body?: string | null;
  method: string;
  path: string;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
}) {
  return {
    body,
    httpMethod: method,
    path,
    pathParameters,
    queryStringParameters,
    requestContext: {
      authorizer: {
        claims: {
          sub: "user-1",
        },
      },
    },
  } as unknown as APIGatewayEvent;
}

function parseBody(response: { body: string }) {
  return JSON.parse(response.body);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedServices.forEach((service) => service.mockResolvedValue(okResponse));
  (analyzeReceiptImage as jest.MockedFunction<typeof analyzeReceiptImage>)
    .mockResolvedValue({
      confidence: 99,
      date: "2026-06-07",
      merchant: "Salon",
      rawText: "Salon\nTotal 25.00",
      source: "textract",
      total: 25,
    });
});

describe("expenses API handler", () => {
  const handler = makeExpensesHandler({ dbService: mockDbService });

  test.each([
    ["POST", "/expenses", {}, createExpenses],
    ["GET", "/expenses", {}, getExpenses],
    ["GET", "/expenses/expense-1", { expenseId: "expense-1" }, getExpenses],
    ["PUT", "/expenses/expense-1", { expenseId: "expense-1" }, updateExpenses],
    [
      "DELETE",
      "/expenses/expense-1",
      { expenseId: "expense-1" },
      deleteExpenses,
    ],
    [
      "POST",
      "/expenses/expense-1/duplicates",
      { expenseId: "expense-1" },
      duplicateExpenses,
    ],
    ["GET", "/expenses/insights", {}, getExpenseInsights],
  ])("routes %s %s", async (method, path, pathParameters, service) => {
    const response = await handler(
      apiEvent({
        body: JSON.stringify({ title: "Hair" }),
        method,
        path,
        pathParameters,
        queryStringParameters: { budgetId: "budget-1", subId: "sub-1" },
      }),
      mockContext
    );

    expect(response).toBe(okResponse);
    expect(service).toHaveBeenCalledTimes(1);
    expect(service).toHaveBeenCalledWith(
      expect.objectContaining({
        dbService: mockDbService,
        userId: "user-1",
        subAccountId: "sub-1",
      })
    );
  });

  test("returns 405 for unsupported methods", async () => {
    const response = await handler(
      apiEvent({ method: "PATCH", path: "/expenses" }),
      mockContext
    );

    expect(response.statusCode).toBe(405);
    expect(parseBody(response)).toEqual({
      message: "Method not allowed",
      statusCode: 405,
    });
  });
});

describe("budgets API handler", () => {
  const handler = makeBudgetHandler({ dbService: mockDbService });

  test.each([
    ["POST", "/budgets", {}, createBudget],
    ["GET", "/budgets", {}, getBudget],
    ["GET", "/budgets/budget-1", { budgetId: "budget-1" }, getBudget],
    ["PUT", "/budgets/budget-1", { budgetId: "budget-1" }, updateBudgets],
    ["DELETE", "/budgets/budget-1", { budgetId: "budget-1" }, deleteBudget],
    [
      "POST",
      "/budgets/budget-1/duplicates",
      { budgetId: "budget-1" },
      duplicateBudget,
    ],
  ])("routes %s %s", async (method, path, pathParameters, service) => {
    const response = await handler(
      apiEvent({
        body: JSON.stringify({ title: "Braids" }),
        method,
        path,
        pathParameters,
        queryStringParameters: { subId: "sub-1" },
      }),
      mockContext
    );

    expect(response).toBe(okResponse);
    expect(service).toHaveBeenCalledTimes(1);
    expect(service).toHaveBeenCalledWith(
      expect.objectContaining({
        dbService: mockDbService,
        userId: "user-1",
        subAccountId: "sub-1",
      })
    );
  });

  test("returns 405 for unsupported methods", async () => {
    const response = await handler(
      apiEvent({ method: "PATCH", path: "/budgets" }),
      mockContext
    );

    expect((response as { statusCode: number }).statusCode).toBe(405);
  });
});

describe("tasks API handler", () => {
  const handler = makeTasksHandler({ dbService: mockDbService });

  test.each([
    ["POST", "/tasks", {}, createTask],
    ["GET", "/tasks", {}, getTasks],
    ["GET", "/tasks/task-1", { taskId: "task-1" }, getTasks],
    ["PUT", "/tasks/task-1", { taskId: "task-1" }, updateTask],
    ["DELETE", "/tasks/task-1", { taskId: "task-1" }, deleteTask],
  ])("routes %s %s", async (method, path, pathParameters, service) => {
    const response = await handler(
      apiEvent({
        body: JSON.stringify({ title: "Follow up" }),
        method,
        path,
        pathParameters,
        queryStringParameters: { subId: "sub-1" },
      }),
      mockContext
    );

    expect(response).toBe(okResponse);
    expect(service).toHaveBeenCalledTimes(1);
    expect(service).toHaveBeenCalledWith(
      expect.objectContaining({
        dbService: mockDbService,
        userId: "user-1",
        subAccountId: "sub-1",
      })
    );
  });

  test("returns 405 for unsupported methods", async () => {
    const response = await handler(
      apiEvent({ method: "PATCH", path: "/tasks" }),
      mockContext
    );

    expect(response.statusCode).toBe(405);
  });
});

describe("calendar API handler", () => {
  const handler = makeCalendarHandler({ dbService: mockDbService });

  test.each([
    ["POST", "/calendar", {}, createCalendarEntry],
    ["GET", "/calendar", {}, getCalendarEntries],
    [
      "GET",
      "/calendar/calendar-1",
      { calendarEntryId: "calendar-1" },
      getCalendarEntries,
    ],
    [
      "PUT",
      "/calendar/calendar-1",
      { calendarEntryId: "calendar-1" },
      updateCalendarEntry,
    ],
    [
      "DELETE",
      "/calendar/calendar-1",
      { calendarEntryId: "calendar-1" },
      deleteCalendarEntry,
    ],
  ])("routes %s %s", async (method, path, pathParameters, service) => {
    const response = await handler(
      apiEvent({
        body: JSON.stringify({ date: "2026-06-07" }),
        method,
        path,
        pathParameters,
        queryStringParameters: { subId: "sub-1" },
      }),
      mockContext
    );

    expect(response).toBe(okResponse);
    expect(service).toHaveBeenCalledTimes(1);
    expect(service).toHaveBeenCalledWith(
      expect.objectContaining({
        dbService: mockDbService,
        userId: "user-1",
        subAccountId: "sub-1",
      })
    );
  });

  test("returns 405 for unsupported methods", async () => {
    const response = await handler(
      apiEvent({ method: "PATCH", path: "/calendar" }),
      mockContext
    );

    expect(response.statusCode).toBe(405);
  });
});

describe("users API handler", () => {
  const handler = makeUsersHandler({ dbService: mockDbService });

  test.each([
    ["GET", getUser],
    ["PUT", updateUser],
    ["POST", createSubAccount],
    ["DELETE", deleteSubAccount],
  ])("routes %s /users", async (method, service) => {
    const response = await handler(
      apiEvent({
        body: JSON.stringify({ userName: "Rex" }),
        method,
        path: "/users",
        queryStringParameters: { subId: "sub-1" },
      }),
      mockContext
    );

    expect(response).toBe(okResponse);
    expect(service).toHaveBeenCalledTimes(1);
    expect(service).toHaveBeenCalledWith(
      expect.objectContaining({
        dbService: mockDbService,
        userId: "user-1",
      })
    );
  });

  test("returns 405 for unsupported methods", async () => {
    const response = await handler(
      apiEvent({ method: "PATCH", path: "/users" }),
      mockContext
    );

    expect((response as { statusCode: number }).statusCode).toBe(405);
  });
});

describe("receipts API handler", () => {
  const textractClient = { send: jest.fn() } as any;
  const handler = makeReceiptsHandler({ textractClient });

  test("routes POST /receipts/scan-v2", async () => {
    const response = await handler(
      apiEvent({
        body: JSON.stringify({
          contentType: "image/jpeg",
          fileName: "receipt.jpg",
          imageBase64: Buffer.from("receipt").toString("base64"),
        }),
        method: "POST",
        path: "/receipts/scan-v2",
      }),
      mockContext
    );

    expect(response.statusCode).toBe(200);
    expect(parseBody(response)).toEqual({
      confidence: 99,
      date: "2026-06-07",
      merchant: "Salon",
      rawText: "Salon\nTotal 25.00",
      source: "textract",
      total: 25,
    });
    expect(analyzeReceiptImage).toHaveBeenCalledWith(
      expect.objectContaining({
        textractClient,
        imageBytes: expect.any(Buffer),
      })
    );
  });

  test("returns 405 for unsupported methods", async () => {
    const response = await handler(
      apiEvent({ method: "GET", path: "/receipts/scan-v2" }),
      mockContext
    );

    expect(response.statusCode).toBe(405);
  });
});
