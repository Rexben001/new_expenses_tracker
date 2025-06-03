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
    const table = new dynamodb.Table(this, "ExpensesTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      tableName: "Expenses",
    });

    // Create a NodejsFunction
    const createExpensesLambda = new NodejsFunction(this, "ExpensesFunction", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST, // Use Node.js 18 runtime
      entry: path.join(
        __dirname,
        "../src/handlers/createExpenses/index.ts" // Path to your Lambda function entry file
      ), // Path to your Lambda function code
      handler: "handler", // The exported handler function in your Lambda code
      environment: {
        TABLE_NAME: table.tableName, // Pass the table name as an environment variable
      },
    });

    const getExpensesLambda = new NodejsFunction(this, "GetExpensesFunction", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST, // Use Node.js 18 runtime
      entry: path.join(
        __dirname,
        "../src/handlers/getExpenses/index.ts" // Path to your Lambda function entry file
      ), // Path to your Lambda function code
      handler: "handler", // The exported handler function in your Lambda code
      environment: {
        TABLE_NAME: table.tableName, // Pass the table name as an environment variable
      },
    });

    // Grant the Lambda function permissions to read and write to the DynamoDB table
    table.grantReadWriteData(createExpensesLambda);
    table.grantReadWriteData(getExpensesLambda);

    const api = new apigateway.RestApi(this, "ExpensesApi", {
      restApiName: "Expenses Service",
      description: "This service serves expenses.",
    });

    // Integrate Lambda with API Gateway
    const createExpensesIntegration = new apigateway.LambdaIntegration(
      createExpensesLambda,
      {
        requestTemplates: { "application/json": '{"statusCode": 200}' },
      }
    );
    const getExpensesIntegration = new apigateway.LambdaIntegration(
      getExpensesLambda,
      {
        requestTemplates: { "application/json": '{"statusCode": 200}' },
      }
    );

    // /expenses route
    const expenses = api.root.addResource("expenses");
    expenses.addMethod("POST", createExpensesIntegration); // POST /expenses

    expenses.addMethod("GET", getExpensesIntegration); // GET /expenses
    // /expenses/{id} route
    const expense = expenses.addResource("expenses/{id}");
    expense.addMethod("GET", getExpensesIntegration); // GET /expenses/{id}

    new cdk.CfnOutput(this, "API Gateway URL", {
      value: api.url, // this gives you the base URL, like https://xxx.execute-api.us-east-1.amazonaws.com/prod/
      description: "The base URL of the API Gateway",
    });
  }
}
