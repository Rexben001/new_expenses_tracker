import { aws_apigateway } from "aws-cdk-lib";

export const handleRoutes = (
  api: aws_apigateway.RestApi,
  authorizer: aws_apigateway.CognitoUserPoolsAuthorizer,
  {
    expensesIntegration,
    budgetsIntegration,
    usersIntegration,
  }: {
    expensesIntegration: aws_apigateway.LambdaIntegration;
    budgetsIntegration: aws_apigateway.LambdaIntegration;
    usersIntegration: aws_apigateway.LambdaIntegration;
  }
) => {
  handleExpensesRoutes(api, authorizer, expensesIntegration);
  handleBudgetsRoutes(api, authorizer, budgetsIntegration);
  handleUsersRoutes(api, authorizer, usersIntegration);
};

const handleExpensesRoutes = (
  api: aws_apigateway.RestApi,
  authorizer: aws_apigateway.CognitoUserPoolsAuthorizer,
  integration: aws_apigateway.LambdaIntegration
) => {
  const authorizerParams = {
    authorizer,
    authorizationType: aws_apigateway.AuthorizationType.COGNITO,
  };
  const expenses = api.root.addResource("expenses");

  const handleExpenses = expenses.addResource("{userId}");

  handleExpenses.addMethod("POST", integration, authorizerParams);

  handleExpenses.addMethod("GET", integration, authorizerParams);

  const handleExpensesWithBudget = handleExpenses.addResource("{budgetId}");

  // POST /expenses/{userId}/{budgetId}
  handleExpensesWithBudget.addMethod("POST", integration, authorizerParams);

  // GET /expenses/{userId}/{budgetId}
  handleExpensesWithBudget.addMethod("GET", integration, authorizerParams);

  // GET /expenses/{userId}/{budgetId}/{expenseId} route
  const withExpenseId = handleExpensesWithBudget.addResource("{expenseId}");

  withExpenseId.addMethod("GET", integration, authorizerParams);
  // PUT /expenses/{userId}/{budgetId}/{expenseId} route
  withExpenseId.addMethod("PUT", integration, authorizerParams);
  // DELETE /expenses/{userId}/{budgetId}/{expenseId} route
  withExpenseId.addMethod("DELETE", integration, authorizerParams);
};

const handleBudgetsRoutes = (
  api: aws_apigateway.RestApi,
  authorizer: aws_apigateway.CognitoUserPoolsAuthorizer,
  integration: aws_apigateway.LambdaIntegration
) => {
  const authorizerParams = {
    authorizer,
    authorizationType: aws_apigateway.AuthorizationType.COGNITO,
  };

  const budgets = api.root.addResource("budgets");
  const handleBudgets = budgets.addResource("{userId}");

  // POST /budgets/{userId}
  handleBudgets.addMethod("POST", integration, authorizerParams);

  // GET /budgets/{userId}
  handleBudgets.addMethod("GET", integration, authorizerParams);

  const handleBudgetsWithId = handleBudgets.addResource("{budgetId}");

  // GET /budgets/{userId}/{budgetId}
  handleBudgetsWithId.addMethod("GET", integration, authorizerParams);

  // PUT /budgets/{userId}/{budgetId}
  handleBudgetsWithId.addMethod("PUT", integration, authorizerParams);
  // DELETE /budgets/{userId}/{budgetId}
  handleBudgetsWithId.addMethod("DELETE", integration, authorizerParams);
};

const handleUsersRoutes = (
  api: aws_apigateway.RestApi,
  authorizer: aws_apigateway.CognitoUserPoolsAuthorizer,
  integration: aws_apigateway.LambdaIntegration
) => {
  const authorizerParams = {
    authorizer,
    authorizationType: aws_apigateway.AuthorizationType.COGNITO,
  };

  const users = api.root.addResource("users");

  // POST /users
  users.addMethod("POST", integration, authorizerParams);

  // GET /users/{userId}
  const userIdResource = users.addResource("{userId}");
  userIdResource.addMethod("GET", integration, authorizerParams);
};
