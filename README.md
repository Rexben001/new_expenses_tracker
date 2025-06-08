# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk deploy` deploy this stack to your default AWS account/region
- `npx cdk diff` compare deployed stack with current state
- `npx cdk synth` emits the synthesized CloudFormation template

🔐 Step 4: Test Authentication (Using Postman or cURL)

1. Sign up a user
   Use AWS CLI or SDK, or enable the hosted UI (for login/signup).

To sign up via CLI:

aws cognito-idp sign-up \
 --client-id <UserPoolClientId> \
 --username test@example.com \
 --password "Password123!" \
 --user-attributes Name=email,Value=test@example.com
Then confirm the user (or enable auto-confirmation in CDK):

aws cognito-idp admin-confirm-sign-up \
 --user-pool-id <UserPoolId> \
 --username test@example.com 2. Log in and get a token

aws cognito-idp initiate-auth \
 --auth-flow USER_PASSWORD_AUTH \
 --client-id <UserPoolClientId> \
 --auth-parameters USERNAME=test@example.com,PASSWORD=Password123!
This will return an IdToken.

3. Call the API
   Use the Authorization header:

curl -H "Authorization: <ID_TOKEN>" https://your-api-id.execute-api.region.amazonaws.com/prod/hello
Y
