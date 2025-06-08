import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";

import { handleRoutes } from "./apigw";

export class ExpensesBeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      env: {
        account: "655187298276", // Use AWS account from environment
        region: "eu-west-1", // Use AWS region from environment
      },
    });

    const table = new dynamodb.Table(this, "BudgetAppTable", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
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

    // Grant the Lambda function permissions to read and write to the DynamoDB table
    table.grantReadWriteData(handleExpensesLambda);
    table.grantReadWriteData(handleBudgetsLambda);
    table.grantReadWriteData(handleUsersLambda);

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

    const api = new apigateway.RestApi(this, "ExpensesApi", {
      restApiName: "Expenses Service",
      description: "This service serves expenses.",
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

    handleRoutes(api, authorizer, { expensesIntegration, budgetsIntegration, usersIntegration });

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
