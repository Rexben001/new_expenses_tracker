import { aws_apigateway } from "aws-cdk-lib";

export const handleRoutes = (
  api: aws_apigateway.RestApi,
  {
    expensesIntegration,
    budgetsIntegration,
  }: {
    expensesIntegration: aws_apigateway.LambdaIntegration;
    budgetsIntegration: aws_apigateway.LambdaIntegration;
  }
) => {
  handleExpensesRoutes(api, expensesIntegration);
  handleBudgetsRoutes(api, budgetsIntegration);
};

const handleExpensesRoutes = (
  api: aws_apigateway.RestApi,
  integration: aws_apigateway.LambdaIntegration
) => {
  const expenses = api.root.addResource("expenses");

  const handleExpenses = expenses.addResource("{userId}");

  handleExpenses.addMethod("POST", integration);

  handleExpenses.addMethod("GET", integration);

  const handleExpensesWithBudget = handleExpenses.addResource("{budgetId}");

  // POST /expenses/{userId}/{budgetId}
  handleExpensesWithBudget.addMethod("POST", integration);

  // GET /expenses/{userId}/{budgetId}
  handleExpensesWithBudget.addMethod("GET", integration);

  // GET /expenses/{userId}/{budgetId}/{expenseId} route
  const withExpenseId = handleExpensesWithBudget.addResource("{expenseId}");

  withExpenseId.addMethod("GET", integration);
  // PUT /expenses/{userId}/{budgetId}/{expenseId} route
  withExpenseId.addMethod("PUT", integration);
};

const handleBudgetsRoutes = (
  api: aws_apigateway.RestApi,
  integration: aws_apigateway.LambdaIntegration
) => {
  const budgets = api.root.addResource("budgets");
  const handleBudgets = budgets.addResource("{userId}");

  // POST /budgets/{userId}
  handleBudgets.addMethod("POST", integration);

  // GET /budgets/{userId}
  handleBudgets.addMethod("GET", integration);

  // GET /budgets/{userId}/{budgetId}
  handleBudgets.addResource("{budgetId}").addMethod("GET", integration);
};
