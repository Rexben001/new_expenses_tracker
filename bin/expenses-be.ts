#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ExpensesBeStack } from "../lib/expenses-be-stack";

const app = new cdk.App();
new ExpensesBeStack(app, "ExpensesBeStack", {});
