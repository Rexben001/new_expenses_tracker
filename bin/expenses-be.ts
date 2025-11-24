#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ExpensesBeStack } from "../lib/expenses-be-stack";

const app = new cdk.App();
const env = app.node.tryGetContext("env") || "test";

const stackName = env === "prod" ? "ExpensesBeStack" : `ExpensesBeStack-${env}`;

new ExpensesBeStack(app, stackName, {
  env: {
    region: env === "prod" ? "eu-west-1" : "eu-west-2",
    account: "655187298276",
  },
});
