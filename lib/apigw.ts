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

  handleExpensesRoutes({
    api,
    authorizerParams,
    integration: expensesIntegration,
  });
  handleBudgetsRoutes({
    api,
    authorizerParams,
    integration: budgetsIntegration,
  });
  handleUsersRoutes({ api, authorizerParams, integration: usersIntegration });
};

const handleExpensesRoutes = ({
  api,
  authorizerParams,
  integration,
}: {
  api: aws_apigateway.RestApi;
  authorizerParams: MethodOptions;
  integration: aws_apigateway.LambdaIntegration;
}) => {
  const handleExpenses = api.root.addResource("expenses");

  const additionaLMethodOptions: MethodOptions = {
    ...authorizerParams,
    requestParameters: {
      "method.request.querystring.category": false,
      "method.request.querystring.budgetId": false,
    },
  };

  handleExpenses.addMethod("POST", integration, additionaLMethodOptions);
  handleExpenses.addMethod("GET", integration, additionaLMethodOptions);

  // GET /expenses/{expenseId} route
  const withExpenseId = handleExpenses.addResource("{expenseId}");

  withExpenseId.addMethod("GET", integration, additionaLMethodOptions);
  // PUT /expenses/{expenseId} route
  withExpenseId.addMethod("PUT", integration, additionaLMethodOptions);
  // DELETE /expenses/{expenseId} route
  withExpenseId.addMethod("DELETE", integration, additionaLMethodOptions);
};

const handleBudgetsRoutes = ({
  api,
  authorizerParams,
  integration,
}: {
  api: aws_apigateway.RestApi;
  authorizerParams: MethodOptions;
  integration: aws_apigateway.LambdaIntegration;
}) => {
  const budgetRootResource = api.root.addResource("budgets");

  const budgetIdResource = budgetRootResource.addResource("{budgetId}");

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
