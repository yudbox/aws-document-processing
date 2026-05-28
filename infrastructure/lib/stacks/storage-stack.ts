import * as cdk from "aws-cdk-lib";
import { aws_s3 as s3, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";

export class StorageStack extends cdk.Stack {
  /** Raw documents bucket — читается в других стеках (например, WorkflowStack) */
  public readonly rawBucket: s3.Bucket;

  /** Results bucket — сюда Lambda/ECS пишет результаты обработки */
  public readonly resultsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── Raw bucket ──────────────────────────────────────────────────────────
    // Сюда клиент загружает документы через pre-signed PUT URL.
    // Файлы временные: после обработки через Step Functions они не нужны.
    this.rawBucket = new s3.Bucket(this, "RawBucket", {
      // Имя содержит account + region → гарантированно уникально глобально
      bucketName: `docprocess-raw-${this.account}-${this.region}`,

      // Шифрование: SSE-S3 достаточно для pet-project
      // В production с PII-данными → BucketEncryption.KMS + CMK
      encryption: s3.BucketEncryption.S3_MANAGED,

      // Требовать HTTPS для всех запросов (Deny HTTP)
      enforceSSL: true,

      // Блокировать любой публичный доступ
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,

      // Versioning отключена: файлы временные, экономим на хранении
      versioned: false,

      // CORS: нужен для прямой загрузки из браузера через pre-signed URL.
      // Браузер делает OPTIONS preflight к s3.amazonaws.com (cross-origin).
      // Для pet-project разрешаем любой origin.
      cors: [
        {
          allowedOrigins: ["*"],
          allowedMethods: [
            s3.HttpMethods.PUT, // загрузка файла через pre-signed URL
            s3.HttpMethods.GET, // скачивание (опционально)
            s3.HttpMethods.HEAD, // проверка существования объекта
          ],
          allowedHeaders: ["*"],
          // Кэшировать preflight результат 50 минут
          maxAge: 3000,
        },
      ],

      // Lifecycle: удалять raw файлы старше 30 дней.
      // После обработки через Step Functions они больше не нужны.
      lifecycleRules: [
        {
          id: "DeleteOldRawFiles",
          enabled: true,
          expiration: Duration.days(30),
          // Удалять и незавершённые multipart uploads (экономия)
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],

      // RETAIN: при cdk destroy bucket остаётся → данные в безопасности.
      // В dev можно поменять на DESTROY + autoDeleteObjects: true.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ─── Outputs (raw) ───────────────────────────────────────────────────────
    // ARN и имя bucket нужны Lambda функциям и другим стекам
    new cdk.CfnOutput(this, "RawBucketName", {
      value: this.rawBucket.bucketName,
      description: "S3 bucket for raw document uploads",
      exportName: "DocProcess-RawBucketName",
    });

    new cdk.CfnOutput(this, "RawBucketArn", {
      value: this.rawBucket.bucketArn,
      description: "S3 bucket ARN for raw document uploads",
      exportName: "DocProcess-RawBucketArn",
    });

    // ─── Results bucket ───────────────────────────────────────────────────────
    // Сюда Lambda/ECS пишет результаты обработки (JSON, превью, нормализованные PDF).
    // Долгосрочное хранение: пользователь должен скачать результат в любой момент.
    this.resultsBucket = new s3.Bucket(this, "ResultsBucket", {
      bucketName: `docprocess-results-${this.account}-${this.region}`,

      // Шифрование: SSE-S3 (baseline for production-grade storage)
      encryption: s3.BucketEncryption.S3_MANAGED,

      // Требовать HTTPS для всех запросов
      enforceSSL: true,

      // Блокировать любой публичный доступ — только сервер читает/пишет
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,

      // Versioning отключена
      versioned: false,

      // CORS: браузер скачивает результат через pre-signed GET URL.
      // PUT не нужен — только Lambda/ECS пишет серверно (без CORS).
      cors: [
        {
          allowedOrigins: ["*"],
          allowedMethods: [
            s3.HttpMethods.GET, // скачивание результата пользователем
            s3.HttpMethods.HEAD, // проверка существования
          ],
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],

      // Lifecycle: результаты хранятся дольше raw.
      // После 90 дней переводим в Infrequent Access (дешевле на 46%).
      // Пользователи редко открывают старые документы — retrieval fee оправдан.
      lifecycleRules: [
        {
          id: "ArchiveOldResults",
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(90),
            },
          ],
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],

      // RETAIN: результаты обработки нельзя потерять при cdk destroy
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ─── Outputs (results) ────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "ResultsBucketName", {
      value: this.resultsBucket.bucketName,
      description: "S3 bucket for processed document results",
      exportName: "DocProcess-ResultsBucketName",
    });

    new cdk.CfnOutput(this, "ResultsBucketArn", {
      value: this.resultsBucket.bucketArn,
      description: "S3 bucket ARN for processed document results",
      exportName: "DocProcess-ResultsBucketArn",
    });
  }
}
