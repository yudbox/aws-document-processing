import * as cdk from "aws-cdk-lib";
import { aws_dynamodb as dynamodb, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";

/**
 * DatabaseStack — DynamoDB Single Table Design
 *
 * Одна таблица хранит три типа записей (Single Table Design):
 *
 * ┌──────────────────────────────┬──────────────────────────────────┬────────────────────────────────────┐
 * │ PK                           │ SK                               │ Назначение                         │
 * ├──────────────────────────────┼──────────────────────────────────┼────────────────────────────────────┤
 * │ USER#{userEmail}             │ DOC#{createdAt}#{documentId}     │ Список документов пользователя     │
 * │ DOC#{documentId}             │ METADATA                         │ Статус документа + путь к S3       │
 * │ DOC#{documentId}             │ RESULT                           │ Результаты обработки               │
 * └──────────────────────────────┴──────────────────────────────────┴────────────────────────────────────┘
 *
 * Access patterns:
 *   AP1. Получить конкретный документ:
 *        GetItem(PK="DOC#uuid", SK="METADATA")
 *
 *   AP2. Все документы пользователя (с cursor pagination):
 *        Query(PK="USER#email", SK begins_with "DOC#")
 *        → LastEvaluatedKey используется как cursor
 *
 *   AP3. Все документы со статусом "processing" (мониторинг):
 *        Query(GSI StatusIndex, PK="processing")
 *        → используется для дашборда и алармов
 *
 *   AP4. Результаты обработки документа:
 *        GetItem(PK="DOC#uuid", SK="RESULT")
 *
 *   AP5. Обновить статус документа:
 *        UpdateItem(PK="DOC#uuid", SK="METADATA", status=...)
 *
 *   AP6. Документы пользователя за период (фильтр по дате):
 *        Query(PK="USER#email", SK between "DOC#2026-05" and "DOC#2026-06")
 */
export class DatabaseStack extends cdk.Stack {
  /** Основная таблица — передаётся в Lambda стеки через grantReadWriteData */
  public readonly documentsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── DocumentsTable ───────────────────────────────────────────────────────
    this.documentsTable = new dynamodb.Table(this, "DocumentsTable", {
      tableName: `docprocess-documents-${this.account}-${this.region}`,

      // Single Table Design: оба ключа — строки с префиксами (USER#, DOC#...)
      // PK определяет физическую partition, SK — порядок внутри неё
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },

      // On-Demand: нет предсказуемого трафика, платим только за запросы.
      // При стабильном трафике > ~200 WCU/сек → Provisioned + Auto Scaling дешевле.
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      // Point-in-Time Recovery: можно восстановить таблицу на любой момент
      // последних 35 дней. Защита от случайного удаления данных.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },

      // Streams: фиксирует каждое изменение таблицы (INSERT / MODIFY / REMOVE).
      // NEW_AND_OLD_IMAGES — сохраняет образ записи до и после изменения.
      // Используется для event-driven расширений (analytics, audit log).
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,

      // TTL: атрибут expiresAt (Unix timestamp в секундах).
      // DynamoDB автоматически удаляет записи с истёкшим TTL (с задержкой до 48ч).
      // Используется для: idempotency store, pending_upload записей.
      timeToLiveAttribute: "expiresAt",

      // RETAIN: при cdk destroy таблица остаётся в AWS → данные в безопасности.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ─── GSI: StatusIndex ─────────────────────────────────────────────────────
    // Access pattern AP3: "все документы со статусом X, отсортированные по дате"
    // PK = status (processing | completed | failed | pending_upload)
    // SK = createdAt (ISO 8601 — позволяет сортировку и range запросы)
    //
    // Почему GSI, а не LSI:
    //   - GSI позволяет использовать status как PK (другой от основного PK)
    //   - LSI потребовал бы того же PK (USER#email), теряя глобальный поиск
    //   - GSI можно добавить после создания таблицы (LSI — только при создании)
    this.documentsTable.addGlobalSecondaryIndex({
      indexName: "StatusIndex",

      partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },

      // INCLUDE: проецируем только нужные атрибуты — экономия на хранении GSI.
      // Lambda мониторинга получит documentId, userEmail, fileName без extra чтений.
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ["documentId", "userEmail", "fileName", "fileSize"],
    });

    // ─── Outputs ──────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "DocumentsTableName", {
      value: this.documentsTable.tableName,
      description: "DynamoDB table name (Single Table Design)",
      exportName: "DocProcess-DocumentsTableName",
    });

    new cdk.CfnOutput(this, "DocumentsTableArn", {
      value: this.documentsTable.tableArn,
      description: "DynamoDB table ARN",
      exportName: "DocProcess-DocumentsTableArn",
    });

    new cdk.CfnOutput(this, "DocumentsTableStreamArn", {
      value: this.documentsTable.tableStreamArn!,
      description: "DynamoDB Streams ARN (for event-driven consumers)",
      exportName: "DocProcess-DocumentsTableStreamArn",
    });
  }
}
