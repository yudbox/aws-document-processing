#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { SecurityStack } from "../lib/stacks/security-stack";
import { StorageStack } from "../lib/stacks/storage-stack";
import { DatabaseStack } from "../lib/stacks/database-stack";
import { LambdaStack } from "../lib/stacks/lambda-stack";
import { ApiStack } from "../lib/stacks/api-stack";

const app = new cdk.App();

// Явный env нужен чтобы имена ресурсов содержали реальный account/region
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

new SecurityStack(app, "SecurityStack", { env });
const storageStack = new StorageStack(app, "StorageStack", { env });
const databaseStack = new DatabaseStack(app, "DatabaseStack", { env });

// LambdaStack зависит от StorageStack и DatabaseStack:
// получает ссылки на bucket и table для IAM grant + env vars
const lambdaStack = new LambdaStack(app, "LambdaStack", {
  env,
  storageStack,
  databaseStack,
});

// ApiStack зависит от LambdaStack:
// получает ссылку на uploadUrlHandler для Lambda Proxy Integration
new ApiStack(app, "ApiStack", { env, lambdaStack });
