import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";

import { handleRoutes } from "./apigw";
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import {
  CfnAccount,
  CfnStage,
  MethodLoggingLevel,
} from "aws-cdk-lib/aws-apigateway";
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";

export class ExpensesBeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      env: {
        account: "655187298276",
        region: "eu-west-1",
      },
    });

    const table = new Table(this, "BudgetAppTable", {
      partitionKey: { name: "PK", type: AttributeType.STRING },
      sortKey: { name: "SK", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    table.addGlobalSecondaryIndex({
      indexName: "UserExpensesIndex",
      partitionKey: { name: "gsiPk", type: AttributeType.STRING },
      sortKey: { name: "gsiSk", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    const handleExpensesLambda = new NodejsFunction(this, "HandleExpensesFn", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "../src/handlers/handleExpenses/index.ts"),
      handler: "handler",
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const handleBudgetsLambda = new NodejsFunction(this, "HandleBudgetFn", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "../src/handlers/handleBudget/index.ts"),
      handler: "handler",
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const handleUsersLambda = new NodejsFunction(this, "HandleUsersFn", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "../src/handlers/handleUsers/index.ts"),
      handler: "handler",
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const handleRecurringBudgetsLambda = new NodejsFunction(
      this,
      "HandleRecurringBudgetsFn",
      {
        runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST,
        entry: path.join(__dirname, "../src/handlers/handleRecurring/index.ts"),
        handler: "handler",
        environment: {
          TABLE_NAME: table.tableName,
        },
      }
    );

    const rule = new cdk.aws_events.Rule(this, "RecurringBudgetsEventRule", {
      schedule: cdk.aws_events.Schedule.cron({ minute: "0", hour: "0" }), // every day at midnight UTC
    });

    rule.addTarget(
      new cdk.aws_events_targets.LambdaFunction(handleRecurringBudgetsLambda)
    );

    // Grant the Lambda function permissions to read and write to the DynamoDB table
    table.grantReadWriteData(handleExpensesLambda);
    table.grantReadWriteData(handleBudgetsLambda);
    table.grantReadWriteData(handleUsersLambda);
    table.grantReadWriteData(handleRecurringBudgetsLambda);

    const userPool = new cognito.UserPool(this, "ExpensesUserPool", {
      userPoolName: "expenses-user-pool",
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 6,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
      },
      userVerification: {
        emailSubject: "Verify your email for our app!",
        emailBody:
          "Hello! Thanks for signing up. Your verification code is {####}",
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
    });

    const userPoolClient = new cognito.UserPoolClient(
      this,
      "ExpensesUserPoolClient",
      {
        userPool,
        generateSecret: false,
        authFlows: {
          userPassword: true,
          custom: true,
        },
      }
    );

    userPool.addTrigger(
      cognito.UserPoolOperation.POST_CONFIRMATION,
      handleUsersLambda
    );

    const cwRole = new Role(this, "ApiGatewayCWLogsRole", {
      assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
    });
    cwRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonAPIGatewayPushToCloudWatchLogs"
      )
    );
    const gatewayAccount = new CfnAccount(this, "ApiGatewayAccount", {
      cloudWatchRoleArn: cwRole.roleArn,
    });

    const api = new apigateway.RestApi(this, "ExpensesApi", {
      restApiName: "Expenses Service",
      description: "This service serves expenses.",
      deployOptions: {
        loggingLevel: MethodLoggingLevel.INFO,
        throttlingBurstLimit: 20,
        throttlingRateLimit: 100,
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "ExpensesAuthorizer",
      {
        cognitoUserPools: [userPool],
      }
    );

    // Integrate Lambda with API Gateway
    const expensesIntegration = new apigateway.LambdaIntegration(
      handleExpensesLambda
    );

    const budgetsIntegration = new apigateway.LambdaIntegration(
      handleBudgetsLambda
    );

    const usersIntegration = new apigateway.LambdaIntegration(
      handleUsersLambda
    );

    new apigateway.GatewayResponse(this, "UnauthorizedResponse", {
      restApi: api,
      type: apigateway.ResponseType.UNAUTHORIZED, // 401
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'*'",
        "Access-Control-Allow-Methods": "'*'",
      },
      statusCode: "401",
      templates: {
        "application/json": JSON.stringify({ message: "Unauthorized" }),
      },
    });

    new apigateway.GatewayResponse(this, "AccessDeniedResponse", {
      restApi: api,
      type: apigateway.ResponseType.ACCESS_DENIED, // 403
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'*'",
        "Access-Control-Allow-Methods": "'*'",
      },
      statusCode: "403",
      templates: {
        "application/json": JSON.stringify({ message: "Access denied" }),
      },
    });

    handleRoutes(api, authorizer, {
      expensesIntegration,
      budgetsIntegration,
      usersIntegration,
    });

    const deploymentStage = api.deploymentStage.node.defaultChild as CfnStage;
    deploymentStage.addDependency(gatewayAccount);

    new cdk.CfnOutput(this, "API Gateway URL", {
      value: api.url, // this gives you the base URL, like https://xxx.execute-api.us-east-1.amazonaws.com/prod/
      description: "The base URL of the API Gateway",
    });

    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
  }
}
