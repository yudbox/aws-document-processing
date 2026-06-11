import * as cdk from "aws-cdk-lib";
import { Duration, aws_lambda as lambda } from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Construct } from "constructs";
import * as path from "path";
import { StorageStack } from "./storage-stack";
import { DatabaseStack } from "./database-stack";
import { MessagingStack } from "./messaging-stack";

interface LambdaStackProps extends cdk.StackProps {
  storageStack: StorageStack;
  databaseStack: DatabaseStack;
  /**
   * MessagingStack: нужен для подключения s3-event-orchestrator к SQS (Этап 17).
   * Передаётся необязательно: если undefined — SQS Event Source Mapping не настраивается
   * (удобно для постепенного деплоя).
   */
  messagingStack?: MessagingStack;
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

  /** Lambda для получения статуса документа по ID (этап 12) */
  public readonly getDocumentHandler: NodejsFunction;

  /** Lambda для списка документов пользователя с cursor pagination (этап 13) */
  public readonly listDocumentsHandler: NodejsFunction;

  /** Lambda для генерации pre-signed GET URL результатов обработки (этап 14) */
  public readonly downloadResultHandler: NodejsFunction;

  /** Lambda consumer SQS → запускает Step Functions (этап 17) */
  public readonly s3EventOrchestratorHandler: NodejsFunction;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const { storageStack, databaseStack, messagingStack } = props;

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

    // ─── get-document-handler ────────────────────────────────────────────────
    // Принимает: pathParameters.documentId
    // Возвращает: {documentId, fileName, fileSize, mimeType, userEmail, status, s3Key, createdAt, updatedAt}
    // Делает GetItem в DynamoDB по PK=DOCUMENT#id, SK=METADATA.
    this.getDocumentHandler = new NodejsFunction(this, "GetDocumentHandler", {
      functionName: `docprocess-get-document-${this.account}-${this.region}`,
      entry: path.join(repoRoot, "lambdas/get-document/handler.ts"),
      projectRoot: repoRoot,
      handler: "handler",

      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.seconds(15),
      memorySize: 256,

      environment: {
        TABLE_NAME: databaseStack.documentsTable.tableName,
      },

      bundling: {
        minify: true,
        sourceMap: false,
        externalModules: [],
      },
    });

    // ─── IAM permissions ──────────────────────────────────────────────────────
    // grantReadData → добавляет dynamodb:GetItem, Query, Scan, BatchGetItem.
    // Lambda может только читать — не писать, не удалять.
    databaseStack.documentsTable.grantReadData(this.getDocumentHandler);

    // ─── list-documents-handler ───────────────────────────────────────────────
    // Принимает: queryStringParameters.userEmail, limit, cursor
    // Возвращает: { items, nextCursor, hasMore }
    // Делает Query по PK=USER#{email} — индекс пользователя, созданный upload-url.
    // ScanIndexForward: false → новые документы первыми.
    this.listDocumentsHandler = new NodejsFunction(
      this,
      "ListDocumentsHandler",
      {
        functionName: `docprocess-list-documents-${this.account}-${this.region}`,
        entry: path.join(repoRoot, "lambdas/list-documents/handler.ts"),
        projectRoot: repoRoot,
        handler: "handler",

        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.seconds(15),
        memorySize: 256,

        environment: {
          TABLE_NAME: databaseStack.documentsTable.tableName,
        },

        bundling: {
          minify: true,
          sourceMap: false,
          externalModules: [],
        },
      },
    );

    // grantReadData → Lambda может делать Query/GetItem, но не писать в таблицу.
    databaseStack.documentsTable.grantReadData(this.listDocumentsHandler);

    // ─── download-result-handler ──────────────────────────────────────────────
    // Принимает: pathParameters.documentId, queryStringParameters.type (text|thumbnail|metadata)
    // Возвращает: { downloadUrl, expiresIn, documentId, type, fileName }
    // Проверяет в DynamoDB что документ существует и status=completed.
    // Генерирует pre-signed GET URL для объекта в results bucket.
    // S3 ключи: results/{documentId}/text.txt | thumb.png | metadata.json
    this.downloadResultHandler = new NodejsFunction(
      this,
      "DownloadResultHandler",
      {
        functionName: `docprocess-download-result-${this.account}-${this.region}`,
        entry: path.join(repoRoot, "lambdas/download-result/handler.ts"),
        projectRoot: repoRoot,
        handler: "handler",

        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.seconds(15),
        memorySize: 256,

        environment: {
          TABLE_NAME: databaseStack.documentsTable.tableName,
          RESULTS_BUCKET: storageStack.resultsBucket.bucketName,
          // Pre-signed URL для скачивания истекает через 15 минут.
          // Короче чем upload (3600с) — download URL более чувствителен к утечке.
          DOWNLOAD_URL_EXPIRES: "900",
        },

        bundling: {
          minify: true,
          sourceMap: false,
          externalModules: [],
        },
      },
    );

    // grantReadData → только dynamodb:GetItem (нужно проверить статус документа)
    databaseStack.documentsTable.grantReadData(this.downloadResultHandler);

    // grantRead → только s3:GetObject на results bucket (не raw bucket, не PutObject)
    storageStack.resultsBucket.grantRead(this.downloadResultHandler);

    new cdk.CfnOutput(this, "UploadUrlHandlerArn", {
      value: this.uploadUrlHandler.functionArn,
      description: "ARN of upload-url Lambda function",
      exportName: "DocProcess-UploadUrlHandlerArn",
    });

    new cdk.CfnOutput(this, "UploadUrlHandlerName", {
      value: this.uploadUrlHandler.functionName,
      description: "Name of upload-url Lambda function",
    });

    new cdk.CfnOutput(this, "GetDocumentHandlerArn", {
      value: this.getDocumentHandler.functionArn,
      description: "ARN of get-document Lambda function",
      exportName: "DocProcess-GetDocumentHandlerArn",
    });

    new cdk.CfnOutput(this, "GetDocumentHandlerName", {
      value: this.getDocumentHandler.functionName,
      description: "Name of get-document Lambda function",
    });

    new cdk.CfnOutput(this, "ListDocumentsHandlerArn", {
      value: this.listDocumentsHandler.functionArn,
      description: "ARN of list-documents Lambda function",
      exportName: "DocProcess-ListDocumentsHandlerArn",
    });

    new cdk.CfnOutput(this, "ListDocumentsHandlerName", {
      value: this.listDocumentsHandler.functionName,
      description: "Name of list-documents Lambda function",
    });

    new cdk.CfnOutput(this, "DownloadResultHandlerArn", {
      value: this.downloadResultHandler.functionArn,
      description: "ARN of download-result Lambda function",
      exportName: "DocProcess-DownloadResultHandlerArn",
    });

    new cdk.CfnOutput(this, "DownloadResultHandlerName", {
      value: this.downloadResultHandler.functionName,
      description: "Name of download-result Lambda function",
    });

    // ─── s3-event-orchestrator (Этап 17) ────────────────────────────────────
    // Читает SQS сообщения содержащие S3 Event и запускает Step Functions execution.
    // STATE_MACHINE_ARN будет передан после создания WorkflowStack (Этап 18).
    // Сейчас задаётся placeholder — заменится в Этапе 18.
    this.s3EventOrchestratorHandler = new NodejsFunction(
      this,
      "S3EventOrchestratorHandler",
      {
        functionName: `docprocess-s3-event-orchestrator-${this.account}-${this.region}`,
        entry: path.join(repoRoot, "lambdas/s3-event-orchestrator/handler.ts"),
        projectRoot: repoRoot,
        handler: "handler",

        runtime: lambda.Runtime.NODEJS_20_X,

        // 60 секунд: StartExecution — быстрый API вызов, дополнительное время для batch 10
        timeout: Duration.seconds(60),
        memorySize: 256,

        environment: {
          // Placeholder: заменить ARN настоящей State Machine в Этапе 18
          STATE_MACHINE_ARN: "PLACEHOLDER_WILL_BE_SET_IN_STAGE_18",
        },

        bundling: {
          minify: true,
          sourceMap: false,
          externalModules: [],
        },
      },
    );

    // SQS Event Source Mapping:
    // ESM автоматически опрашивает processing-queue (обычный long polling)
    // и вызывает Lambda с batchом до 10 сообщений.
    // reportBatchItemFailures — включает partial batch failures:
    //   Lambda возвращает { batchItemFailures: [...] } вместо throw —
    //   AWS повторит только неудачные, успешные удалит автоматически.
    if (messagingStack) {
      this.s3EventOrchestratorHandler.addEventSource(
        new SqsEventSource(messagingStack.processingQueue, {
          batchSize: 10,
          // reportBatchItemFailures: обязательно должен быть true чтобы
          // partial batch failures работали как ожидается
          reportBatchItemFailures: true,
        }),
      );
    }

    new cdk.CfnOutput(this, "S3EventOrchestratorHandlerArn", {
      value: this.s3EventOrchestratorHandler.functionArn,
      description: "ARN of s3-event-orchestrator Lambda function",
      exportName: "DocProcess-S3EventOrchestratorArn",
    });
  }
}
