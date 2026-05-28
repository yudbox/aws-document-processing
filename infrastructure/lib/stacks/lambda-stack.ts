import * as cdk from "aws-cdk-lib";
import { Duration, aws_lambda as lambda } from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";
import { StorageStack } from "./storage-stack";
import { DatabaseStack } from "./database-stack";

interface LambdaStackProps extends cdk.StackProps {
  storageStack: StorageStack;
  databaseStack: DatabaseStack;
}

/**
 * LambdaStack — все Lambda функции Фазы 2 (Upload Flow).
 *
 * Стек принимает storageStack и databaseStack через props,
 * чтобы получить ссылки на bucket и table для:
 *   1. CDK Grant методов (IAM permissions)
 *   2. Передачи имён ресурсов через env vars
 *
 * Принцип Least Privilege:
 *   - uploadUrlHandler получает только s3:PutObject (не GetObject, не DeleteObject)
 *   - uploadUrlHandler получает только dynamodb:PutItem + TransactWriteItems
 *   - CDK .grantPut() и .grantWriteData() создают минимально необходимые IAM политики
 */
export class LambdaStack extends cdk.Stack {
  /** Lambda для генерации pre-signed PUT URL (этап 10) */
  public readonly uploadUrlHandler: NodejsFunction;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const { storageStack, databaseStack } = props;

    // ─── upload-url-handler ───────────────────────────────────────────────────
    // Принимает: {fileName, fileSize, mimeType, userEmail}
    // Возвращает: {documentId, uploadUrl, expiresIn}
    // Клиент делает HTTP PUT на uploadUrl напрямую в S3 (без Lambda в цепочке).
    // Корень монорепо — на три уровня вверх от infrastructure/lib/stacks/
    const repoRoot = path.join(__dirname, "../../..");

    this.uploadUrlHandler = new NodejsFunction(this, "UploadUrlHandler", {
      functionName: `docprocess-upload-url-${this.account}-${this.region}`,

      // entry должен быть внутри projectRoot.
      // projectRoot = корень монорепо, чтобы esbuild нашёл lambdas/ снаружи infrastructure/
      entry: path.join(repoRoot, "lambdas/upload-url/handler.ts"),
      projectRoot: repoRoot,
      handler: "handler", // имя экспортируемой функции

      runtime: lambda.Runtime.NODEJS_20_X,

      // 30 секунд достаточно: S3 pre-sign и DynamoDB TransactWrite — быстрые операции.
      // Lambda API Gateway имеет лимит 29 секунд → ставим 30 чтобы видеть таймаут Lambda.
      timeout: Duration.seconds(30),

      // 256 MB: для этого handler'а CPU не критичен.
      // Правило: 1769 MB ≈ 1 vCPU. Для IO-bound задач (SDK вызовы) хватит 256 MB.
      memorySize: 256,

      environment: {
        // Имена ресурсов передаются из других стеков — никогда не хардкодим ARN/имена.
        BUCKET_NAME: storageStack.rawBucket.bucketName,
        TABLE_NAME: databaseStack.documentsTable.tableName,
        // Срок жизни pre-signed URL в секундах (1 час)
        PRESIGNED_URL_EXPIRES: "3600",
      },

      bundling: {
        // Минификация уменьшает размер zip → чуть быстрее cold start
        minify: true,
        sourceMap: false,
        // esbuild bundler включит все @aws-sdk/* пакеты в zip.
        // Это важно: Lambda runtime Node.js 20 содержит AWS SDK v3,
        // но версии могут отличаться от наших зависимостей → бандлим явно.
        externalModules: [],
      },
    });

    // ─── IAM permissions (Least Privilege) ───────────────────────────────────
    // grantPut → добавляет s3:PutObject на bucket ARN в IAM роль Lambda.
    // Lambda НЕ может читать или удалять файлы из raw bucket — только записывать.
    storageStack.rawBucket.grantPut(this.uploadUrlHandler);

    // grantWriteData → добавляет dynamodb:PutItem, UpdateItem, DeleteItem, BatchWriteItem,
    // TransactWriteItems на table ARN.
    // Lambda НЕ может читать из таблицы — только писать.
    databaseStack.documentsTable.grantWriteData(this.uploadUrlHandler);

    // ─── Outputs ──────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "UploadUrlHandlerArn", {
      value: this.uploadUrlHandler.functionArn,
      description: "ARN of upload-url Lambda function",
      exportName: "DocProcess-UploadUrlHandlerArn",
    });

    new cdk.CfnOutput(this, "UploadUrlHandlerName", {
      value: this.uploadUrlHandler.functionName,
      description: "Name of upload-url Lambda function",
    });
  }
}
