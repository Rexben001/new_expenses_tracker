import { handleRoutes } from "../lib/apigw";

type RecordedMethod = {
  path: string;
  method: string;
};

function createApiRecorder() {
  const methods: RecordedMethod[] = [];

  const createResource = (path: string): any => ({
    addResource(name: string) {
      return createResource(`${path}/${name}`);
    },
    addMethod(method: string) {
      methods.push({ path, method });
    },
    addCorsPreflight() {
      return undefined;
    },
  });

  return {
    api: {
      root: createResource(""),
    },
    methods,
  };
}

describe("API Gateway routes", () => {
  test("registers every public API route and method", () => {
    const { api, methods } = createApiRecorder();

    handleRoutes(api as any, {} as any, {
      expensesIntegration: {} as any,
      budgetsIntegration: {} as any,
      usersIntegration: {} as any,
      tasksIntegration: {} as any,
      calendarIntegration: {} as any,
      receiptsIntegration: {} as any,
      videosIntegration: {} as any,
    });

    expect(
      methods
        .map(({ method, path }) => `${method} ${path}`)
        .sort()
    ).toEqual(
      [
        "DELETE /budgets/{budgetId}",
        "DELETE /calendar/{calendarEntryId}",
        "DELETE /expenses/{expenseId}",
        "DELETE /tasks/{taskId}",
        "DELETE /users",
        "DELETE /video-library/items",
        "GET /budgets",
        "GET /budgets/{budgetId}",
        "GET /calendar",
        "GET /calendar/{calendarEntryId}",
        "GET /expenses",
        "GET /expenses/insights",
        "GET /expenses/{expenseId}",
        "GET /tasks",
        "GET /tasks/{taskId}",
        "GET /users",
        "GET /video-library/folders",
        "GET /video-library/items",
        "POST /budgets",
        "POST /budgets/{budgetId}/duplicates",
        "POST /calendar",
        "POST /expenses",
        "POST /expenses/{expenseId}/duplicates",
        "POST /receipts/scan-v2",
        "POST /tasks",
        "POST /users",
        "POST /video-upload-url",
        "PUT /budgets/{budgetId}",
        "PUT /calendar/{calendarEntryId}",
        "PUT /expenses/{expenseId}",
        "PUT /tasks/{taskId}",
        "PUT /users",
      ].sort()
    );
  });
});
