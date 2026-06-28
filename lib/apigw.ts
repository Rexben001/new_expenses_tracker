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
    calendarIntegration,
    howToIntegration,
    receiptsIntegration,
    videosIntegration,
  }: {
    expensesIntegration: aws_apigateway.LambdaIntegration;
    budgetsIntegration: aws_apigateway.LambdaIntegration;
    usersIntegration: aws_apigateway.LambdaIntegration;
    tasksIntegration: aws_apigateway.LambdaIntegration;
    calendarIntegration: aws_apigateway.LambdaIntegration;
    howToIntegration: aws_apigateway.LambdaIntegration;
    receiptsIntegration: aws_apigateway.LambdaIntegration;
    videosIntegration: aws_apigateway.LambdaIntegration;
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
  handleCalendarRoutes({
    api,
    authorizerParams,
    integration: calendarIntegration,
  });
  handleHowToRoutes({
    api,
    authorizerParams,
    integration: howToIntegration,
  });
  handleUsersRoutes({ api, authorizerParams, integration: usersIntegration });
  handleReceiptsRoutes({
    api,
    authorizerParams,
    integration: receiptsIntegration,
  });
  handleVideosRoutes({
    api,
    authorizerParams,
    integration: videosIntegration,
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

  const insights = handleExpenses.addResource("insights");
  addCorsPreflight(insights);
  insights.addMethod("GET", integration, authorizerParams);

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

const handleCalendarRoutes = ({
  api,
  authorizerParams,
  integration,
}: {
  api: aws_apigateway.RestApi;
  authorizerParams: MethodOptions;
  integration: aws_apigateway.LambdaIntegration;
}) => {
  const calendar = api.root.addResource("calendar");
  addCorsPreflight(calendar);

  calendar.addMethod("GET", integration, authorizerParams);
  calendar.addMethod("POST", integration, authorizerParams);

  const calendarEntryId = calendar.addResource("{calendarEntryId}");
  addCorsPreflight(calendarEntryId);

  calendarEntryId.addMethod("GET", integration, authorizerParams);
  calendarEntryId.addMethod("PUT", integration, authorizerParams);
  calendarEntryId.addMethod("DELETE", integration, authorizerParams);
};

const handleHowToRoutes = ({
  api,
  authorizerParams,
  integration,
}: {
  api: aws_apigateway.RestApi;
  authorizerParams: MethodOptions;
  integration: aws_apigateway.LambdaIntegration;
}) => {
  const howTo = api.root.addResource("how-to");
  addCorsPreflight(howTo);

  const listMethodOptions: MethodOptions = {
    ...authorizerParams,
    requestParameters: {
      "method.request.querystring.category": false,
      "method.request.querystring.cursor": false,
      "method.request.querystring.limit": false,
      "method.request.querystring.query": false,
      "method.request.querystring.tag": false,
    },
  };

  howTo.addMethod("GET", integration, listMethodOptions);
  howTo.addMethod("POST", integration, authorizerParams);

  const howToId = howTo.addResource("{howToId}");
  addCorsPreflight(howToId);

  howToId.addMethod("GET", integration, authorizerParams);
  howToId.addMethod("PUT", integration, authorizerParams);
  howToId.addMethod("DELETE", integration, authorizerParams);

  const secrets = howToId.addResource("secrets");
  addCorsPreflight(secrets);
  secrets.addMethod("GET", integration, authorizerParams);
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

const handleVideosRoutes = ({
  api,
  authorizerParams,
  integration,
}: {
  api: aws_apigateway.RestApi;
  authorizerParams: MethodOptions;
  integration: aws_apigateway.LambdaIntegration;
}) => {
  const uploadUrl = api.root.addResource("video-upload-url");
  addCorsPreflight(uploadUrl);
  uploadUrl.addMethod("POST", integration, authorizerParams);

  const library = api.root.addResource("video-library");
  addCorsPreflight(library);

  const items = library.addResource("items");
  addCorsPreflight(items);
  const itemMethodOptions: MethodOptions = {
    ...authorizerParams,
    requestParameters: {
      "method.request.querystring.cursor": false,
      "method.request.querystring.limit": false,
      "method.request.querystring.prefix": false,
    },
  };
  items.addMethod("GET", integration, itemMethodOptions);
  items.addMethod("DELETE", integration, itemMethodOptions);

  const folders = library.addResource("folders");
  addCorsPreflight(folders);
  folders.addMethod("GET", integration, {
    ...authorizerParams,
    requestParameters: {
      "method.request.querystring.root": false,
    },
  });
};
