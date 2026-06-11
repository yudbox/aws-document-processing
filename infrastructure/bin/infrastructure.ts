#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { SecurityStack } from "../lib/stacks/security-stack";
import { StorageStack } from "../lib/stacks/storage-stack";
import { DatabaseStack } from "../lib/stacks/database-stack";
import { LambdaStack } from "../lib/stacks/lambda-stack";
import { ApiStack } from "../lib/stacks/api-stack";
import { MessagingStack } from "../lib/stacks/messaging-stack";

const app = new cdk.App();

// Явный env нужен чтобы имена ресурсов содержали реальный account/region
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

new SecurityStack(app, "SecurityStack", { env });

// MessagingStack создаётся ДО StorageStack:
// StorageStack нужна ссылка на processingQueue для S3 Event Notification.
const messagingStack = new MessagingStack(app, "MessagingStack", { env });

const storageStack = new StorageStack(app, "StorageStack", {
  env,
  processingQueue: messagingStack.processingQueue,
});
const databaseStack = new DatabaseStack(app, "DatabaseStack", { env });

// LambdaStack зависит от StorageStack, DatabaseStack и MessagingStack:
// - storageStack/databaseStack: IAM grant + env vars для Phase 2 handlers
// - messagingStack: SQS Event Source Mapping для s3-event-orchestrator (Этап 17)
const lambdaStack = new LambdaStack(app, "LambdaStack", {
  env,
  storageStack,
  databaseStack,
  messagingStack,
});

// ApiStack зависит от LambdaStack:
// получает ссылку на uploadUrlHandler для Lambda Proxy Integration
new ApiStack(app, "ApiStack", { env, lambdaStack });
