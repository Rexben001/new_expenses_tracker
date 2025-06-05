import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

export class ExpensesBeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      env: {
        account: "655187298276", // Use AWS account from environment
        region: "eu-west-1", // Use AWS region from environment
      },
    });

    // Create a DynamoDB table
    const table = new dynamodb.Table(this, "BudgetAppTable", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Create a NodejsFunction
    const handleExpensesLambda = new NodejsFunction(this, "HandleExpensesFn", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST, // Use Node.js 18 runtime
      entry: path.join(__dirname, "../src/handlers/handleExpenses/index.ts"),
      handler: "handler",
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const handleBudgetsLambda = new NodejsFunction(this, "HandleBudgetFn", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST, // Use Node.js 18 runtime
      entry: path.join(
        __dirname,
        "../src/handlers/handleBudget/index.ts" 
      ),
      handler: "handler",
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    // Grant the Lambda function permissions to read and write to the DynamoDB table
    table.grantReadWriteData(handleExpensesLambda);
    table.grantReadWriteData(handleBudgetsLambda);

    const api = new apigateway.RestApi(this, "ExpensesApi", {
      restApiName: "Expenses Service",
      description: "This service serves expenses.",
    });

    // Integrate Lambda with API Gateway
    const createExpensesIntegration = new apigateway.LambdaIntegration(
      handleExpensesLambda,
      {
        requestTemplates: { "application/json": '{"statusCode": 200}' },
      }
    );

    const budgetIntegration = new apigateway.LambdaIntegration(
      handleBudgetsLambda,
      {
        requestTemplates: { "application/json": '{"statusCode": 200}' },
      }
    );

    // /expenses route
    const expenses = api.root.addResource("expenses");

    const handleExpenses = expenses
      .addResource("{userId}")
      .addResource("{budgetId}");

    // POST /expenses/{userId}/{budgetId}
    handleExpenses.addMethod("POST", createExpensesIntegration);

    // /expenses/{userId}/{budgetId} route
    handleExpenses
      .addResource("{expenseId}")
      .addMethod("GET", createExpensesIntegration);

    // /budgets route
    const budgets = api.root.addResource("budgets");
    const handleBudgets = budgets.addResource("{userId}");
    // POST /budgets/{userId}
    handleBudgets.addMethod("POST", budgetIntegration);
    // GET /budgets/{userId}/{budgetId}
    handleBudgets.addResource("{budgetId}").addMethod("GET", budgetIntegration);

    new cdk.CfnOutput(this, "API Gateway URL", {
      value: api.url, // this gives you the base URL, like https://xxx.execute-api.us-east-1.amazonaws.com/prod/
      description: "The base URL of the API Gateway",
    });
  }
}
