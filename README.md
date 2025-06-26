# 📘 Expenses Tracker CDK Backend Documentation

This is a complete AWS CDK-based backend infrastructure for an **Expenses Tracker** application, built with:

- **API Gateway** (REST API + CORS + Cognito authorizer)
- **Lambda functions** for handling budgets, expenses, and users
- **DynamoDB** as the persistent store (with GSI for category and user-based queries)
- **Cognito** for user authentication (email/password)
- **CloudWatch Logs** for monitoring

---

## 📦 Stack Overview

| Component           | Description                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| `ExpensesBeStack`   | Main CDK stack containing all infrastructure                            |
| `BudgetAppTable`    | DynamoDB table with `PK`, `SK`, and a GSI (`gsiPk`, `gsiSk`)            |
| `RestApi`           | API Gateway REST API with structured routing and Cognito authentication |
| `UserPool`          | Cognito user pool (sign-up/login with email)                            |
| `Handle*Fn` Lambdas | Lambda functions for each domain: expenses, budgets, users              |
| `handleRoutes()`    | Defines and wires up API routes + CORS support                          |

---

## 🧱 DynamoDB Schema

| Key     | Description                              |
| ------- | ---------------------------------------- |
| `PK`    | Partition Key (e.g., `USER#123`)         |
| `SK`    | Sort Key (e.g., `EXPENSE#2023-06-01`)    |
| `gsiPk` | GSI partition key for user-based queries |
| `gsiSk` | GSI sort key (e.g., `CATEGORY#food`)     |

### Global Secondary Index

```ts
indexName: "UserExpensesIndex";
partitionKey: gsiPk;
sortKey: gsiSk;
```

---

## 🔐 Cognito Authentication

### Sign Up

```bash
aws cognito-idp sign-up \
  --client-id <UserPoolClientId> \
  --username test@example.com \
  --password "Password123!" \
  --user-attributes Name=email,Value=test@example.com
```

### Confirm User

```bash
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id <UserPoolId> \
  --username test@example.com
```

### Login & Get ID Token

```bash
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id <UserPoolClientId> \
  --auth-parameters USERNAME=test@example.com,PASSWORD=Password123!
```

Use the `IdToken` in the `Authorization` header:

```bash
curl -H "Authorization: <ID_TOKEN>" https://your-api-id.execute-api.region.amazonaws.com/prod/expenses
```

---

## 🔀 API Gateway

- Fully integrated with Cognito User Pools as an authorizer
- CORS enabled globally for all resources
- Logs enabled via `CfnAccount` and CloudWatch IAM role

### Throttling Settings

```ts
throttlingBurstLimit: 20,
throttlingRateLimit: 100,
```

These control the request burst and steady-state rate to avoid abuse.

### CORS Headers

```ts
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: *
Access-Control-Allow-Methods: *
```

### Error Responses

- `401 Unauthorized`: missing/invalid token
- `403 Access Denied`: insufficient access

---

## 🧠 Routing

### Expenses

- `GET /expenses`
- `GET /expenses/{id}`
- `POST /expenses`
- `PUT /expenses/{id}`
- `DELETE /expenses/{id}`
- `POST /expenses/{id}/duplicates`

### Budgets

- `GET /budgets`
- `GET /budgets/{id}`
- `POST /budgets`
- `PUT /budgets/{id}`
- `DELETE /budgets/{id}`

### Users

- `GET /users`
- `PUT /users`

All routes are protected using Cognito authorizer.

---

## 🧾 Logging Setup

API Gateway logging to CloudWatch requires:

- IAM Role: `ApiGatewayLogRole` (with `AmazonAPIGatewayPushToCloudWatchLogs`)
- Registered globally via `CfnAccount`
- `deploymentStage.addDependency(gatewayAccount)` to avoid race condition

---

## 🚀 Deployment Commands

```bash
npm install       # install dependencies
npm run build     # compile TypeScript
npx cdk synth     # generate CloudFormation template
npx cdk deploy    # deploy to AWS
```

---

## 📤 Outputs

- `API Gateway URL`: base URL for API calls
- `UserPoolId`: Cognito user pool
- `UserPoolClientId`: Cognito app client ID

---

## ✅ Next Steps

- Add rate limiting per user with usage plans
- Add unit tests with Jest
- Add stage-specific CORS/redirect configs
- Integrate frontend using `fetch` with ID token

---

## Postman Docs
