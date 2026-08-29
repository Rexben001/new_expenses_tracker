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
      foodItemsIntegration: {} as any,
      mealPlansIntegration: {} as any,
      shoppingIntegration: {} as any,
      calendarIntegration: {} as any,
      howToIntegration: {} as any,
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
        "DELETE /food-items/{foodItemId}",
        "DELETE /meal-plans/meals/{mealId}",
        "DELETE /meal-plans/schedule/{day}/{mealType}",
        "DELETE /shopping-items/{shoppingItemId}",
        "DELETE /how-to/{howToId}",
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
        "GET /food-items",
        "GET /food-items/stats",
        "GET /food-items/{foodItemId}",
        "GET /meal-plans",
        "GET /shopping-items",
        "GET /shopping-items/history",
        "GET /how-to",
        "GET /how-to/{howToId}",
        "GET /how-to/{howToId}/secrets",
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
        "POST /food-items",
        "POST /meal-plans/meals",
        "POST /shopping-items",
        "POST /shopping-items/{shoppingItemId}/purchase",
        "POST /shopping-items/{shoppingItemId}/readd",
        "POST /how-to",
        "POST /receipts/scan-v2",
        "POST /tasks",
        "POST /users",
        "POST /video-upload-url",
        "PUT /budgets/{budgetId}",
        "PUT /calendar/{calendarEntryId}",
        "PUT /expenses/{expenseId}",
        "PUT /food-items/{foodItemId}",
        "PUT /meal-plans/meals/{mealId}",
        "PUT /meal-plans/schedule/{day}/{mealType}",
        "PUT /shopping-items/{shoppingItemId}",
        "PUT /how-to/{howToId}",
        "PUT /tasks/{taskId}",
        "PUT /users",
      ].sort()
    );
  });
});
