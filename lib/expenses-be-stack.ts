import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import path = require("path");

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
    const lambdaFunction = new NodejsFunction(this, "ExpensesFunction", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_18_X, // Use Node.js 18 runtime
      entry: path.join(
        __dirname,
        "../src/handlers/createExpenses/index.ts" // Path to your Lambda function entry file
      ), // Path to your Lambda function code
      handler: "handler", // The exported handler function in your Lambda code
      environment: {
        TABLE_NAME: table.tableName, // Pass the table name as an environment variable
      },
      bundling: {
        esbuildArgs: {
          "--packages": "bundle", // Add this argument to fix the issue
        },
      },
    });

    // Grant the Lambda function permissions to read and write to the DynamoDB table
    table.grantReadWriteData(lambdaFunction);
  }
}
