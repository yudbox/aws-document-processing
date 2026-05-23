#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { StorageStack } from "../lib/stacks/storage-stack";

const app = new cdk.App();

// Явный env нужен чтобы bucket name содержал реальный account/region
// (используется в bucketName: `docprocess-raw-${this.account}-${this.region}`)
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

new StorageStack(app, "StorageStack", { env });
