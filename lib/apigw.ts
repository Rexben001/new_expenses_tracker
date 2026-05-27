import { aws_apigateway } from "aws-cdk-lib";
import { MethodOptions } from "aws-cdk-lib/aws-apigateway";

const addCorsPreflight = (resource: aws_apigateway.Resource) => {
  resource.addCorsPreflight({
    allowOrigins: ["*"], // or your frontend URL e.g. ['https://myapp.com']
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  });
};

export const handleRoutes = (
  api: aws_apigateway.RestApi,
  authorizer: aws_apigateway.CognitoUserPoolsAuthorizer,
  {
    expensesIntegration,
    budgetsIntegration,
    usersIntegration,
    tasksIntegration,
    receiptsIntegration,
  }: {
    expensesIntegration: aws_apigateway.LambdaIntegration;
    budgetsIntegration: aws_apigateway.LambdaIntegration;
    usersIntegration: aws_apigateway.LambdaIntegration;
    tasksIntegration: aws_apigateway.LambdaIntegration;
    receiptsIntegration: aws_apigateway.LambdaIntegration;
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
  handleTasksRoutes({ api, authorizerParams, integration: tasksIntegration });
  handleUsersRoutes({ api, authorizerParams, integration: usersIntegration });
  handleReceiptsRoutes({
    api,
    authorizerParams,
    integration: receiptsIntegration,
  });
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

  addCorsPreflight(handleExpenses);

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

  addCorsPreflight(withExpenseId);

  withExpenseId.addMethod("GET", integration, additionaLMethodOptions);
  // PUT /expenses/{expenseId} route
  withExpenseId.addMethod("PUT", integration, additionaLMethodOptions);
  // DELETE /expenses/{expenseId} route
  withExpenseId.addMethod("DELETE", integration, additionaLMethodOptions);

  const duplicates = withExpenseId.addResource("duplicates");

  addCorsPreflight(duplicates);

  duplicates.addMethod("POST", integration, additionaLMethodOptions);
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
  const additionaLMethodOptions: MethodOptions = {
    ...authorizerParams,
    requestParameters: {
      "method.request.querystring.only": false,
    },
  };

  const budgetRootResource = api.root.addResource("budgets");
  addCorsPreflight(budgetRootResource);

  const budgetIdResource = budgetRootResource.addResource("{budgetId}");

  addCorsPreflight(budgetIdResource);

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

  const duplicates = budgetIdResource.addResource("duplicates");

  addCorsPreflight(duplicates);

  duplicates.addMethod("POST", integration, additionaLMethodOptions);
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
  addCorsPreflight(users);

  users.addMethod("GET", integration, authorizerParams);
  users.addMethod("PUT", integration, authorizerParams);
  users.addMethod("POST", integration, authorizerParams);
  users.addMethod("DELETE", integration, authorizerParams);
};

const handleTasksRoutes = ({
  api,
  authorizerParams,
  integration,
}: {
  api: aws_apigateway.RestApi;
  authorizerParams: MethodOptions;
  integration: aws_apigateway.LambdaIntegration;
}) => {
  const tasks = api.root.addResource("tasks");
  addCorsPreflight(tasks);

  tasks.addMethod("GET", integration, authorizerParams);
  tasks.addMethod("POST", integration, authorizerParams);

  const taskId = tasks.addResource("{taskId}");
  addCorsPreflight(taskId);

  taskId.addMethod("GET", integration, authorizerParams);
  taskId.addMethod("PUT", integration, authorizerParams);
  taskId.addMethod("DELETE", integration, authorizerParams);
};

const handleReceiptsRoutes = ({
  api,
  authorizerParams,
  integration,
}: {
  api: aws_apigateway.RestApi;
  authorizerParams: MethodOptions;
  integration: aws_apigateway.LambdaIntegration;
}) => {
  const receipts = api.root.addResource("receipts");
  addCorsPreflight(receipts);

  const scanV2 = receipts.addResource("scan-v2");
  addCorsPreflight(scanV2);

  scanV2.addMethod("POST", integration, authorizerParams);
};
