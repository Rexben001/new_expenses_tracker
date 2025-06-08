import { aws_apigateway } from "aws-cdk-lib";
import { MethodOptions } from "aws-cdk-lib/aws-apigateway";

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
  const authorizerParams = {
    authorizer,
    authorizationType: aws_apigateway.AuthorizationType.COGNITO,
  };

  const budgetRootResource = api.root.addResource("budgets");

  const budgetIdResource = budgetRootResource.addResource("{budgetId}");

  handleExpensesRoutes({
    api,
    authorizerParams,
    integration: expensesIntegration,
    budgetIdResource,
  });
  handleBudgetsRoutes({
    api,
    authorizerParams,
    integration: budgetsIntegration,
    budgetRootResource,
    budgetIdResource,
  });
  handleUsersRoutes({ api, authorizerParams, integration: usersIntegration });
};

const handleExpensesRoutes = ({
  api,
  authorizerParams,
  integration,
  budgetIdResource,
}: {
  api: aws_apigateway.RestApi;
  authorizerParams: MethodOptions;
  integration: aws_apigateway.LambdaIntegration;
  budgetIdResource: aws_apigateway.Resource;
}) => {
  const handleExpenses = api.root.addResource("expenses");

  handleExpenses.addMethod("POST", integration, authorizerParams);
  handleExpenses.addMethod("GET", integration, authorizerParams);

  // GET /expenses/{budgetId}/{expenseId} route
  const withExpenseId = handleExpenses
    .addResource("{budgetId}")
    .addResource("{expenseId}");

  withExpenseId.addMethod("GET", integration, authorizerParams);
  // PUT /expenses/{budgetId}/{expenseId} route
  withExpenseId.addMethod("PUT", integration, authorizerParams);
  // DELETE /expenses/{budgetId}/{expenseId} route
  withExpenseId.addMethod("DELETE", integration, authorizerParams);

  // handle budgets/{budgetId}/expenses route
  const handleBudgetExpenses = budgetIdResource.addResource("expenses");
  handleBudgetExpenses.addMethod("POST", integration, authorizerParams);
  handleBudgetExpenses.addMethod("GET", integration, authorizerParams);
};

const handleBudgetsRoutes = ({
  api,
  authorizerParams,
  integration,
  budgetRootResource,
  budgetIdResource,
}: {
  api: aws_apigateway.RestApi;
  authorizerParams: MethodOptions;
  integration: aws_apigateway.LambdaIntegration;
  budgetRootResource: aws_apigateway.Resource;
  budgetIdResource: aws_apigateway.Resource;
}) => {
  // POST /budgets
  budgetRootResource.addMethod("POST", integration, authorizerParams);

  // GET /budgets
  budgetRootResource.addMethod("GET", integration, authorizerParams);

  // GET /budgets/{budgetId}
  budgetIdResource.addMethod("GET", integration, authorizerParams);

  // PUT /budgets/{budgetId}
  budgetIdResource.addMethod("PUT", integration, authorizerParams);
  // DELETE /budgets/{budgetId}
  budgetIdResource.addMethod("DELETE", integration, authorizerParams);
};

const handleUsersRoutes = ({
  api,
  authorizerParams,
  integration,
}: {
  api: aws_apigateway.RestApi;
  authorizerParams: MethodOptions;
  integration: aws_apigateway.LambdaIntegration;
}) => {
  const users = api.root.addResource("users");

  // GET /users/{userId}
  const userIdResource = users.addResource("{userId}");
  userIdResource.addMethod("GET", integration, authorizerParams);
};
