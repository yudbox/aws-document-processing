import * as cdk from "aws-cdk-lib";
import {
  Duration,
  aws_sqs as sqs,
  aws_cloudwatch as cw,
  aws_iam as iam,
} from "aws-cdk-lib";
import { Construct } from "constructs";

/**
 * MessagingStack — SQS очереди для event-driven pipeline (Фаза 3).
 *
 * Архитектура:
 *   S3 (ObjectCreated) → processing-queue → Lambda s3-event-orchestrator
 *                                                       ↓ (после N попыток)
 *                                             processing-dlq → CloudWatch Alarm
 *
 * Две очереди:
 *   processing-dlq   — Dead Letter Queue, retention 14 дней
 *   processing-queue — основная очередь, redrive → DLQ после 3 попыток
 *
 * Visibility timeout = 15 минут (= max Lambda timeout).
 * Правило: visibility timeout >= max время обработки одного сообщения.
 * Иначе сообщение вернётся в очередь до завершения Lambda → дублирование.
 */
export class MessagingStack extends cdk.Stack {
  /** Dead Letter Queue — "склад" необработанных сообщений для анализа */
  public readonly processingDlq: sqs.Queue;

  /** Основная очередь — S3 события ожидают обработки Lambda */
  public readonly processingQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── Dead Letter Queue ────────────────────────────────────────────────────
    // Сообщения попадают сюда после maxReceiveCount неудачных попыток.
    // Retention 14 дней: нужно время чтобы:
    //   1. CloudWatch Alarm уведомил инженера
    //   2. Инженер проанализировал сообщение
    //   3. Исправил код и сделал redrive обратно в processing-queue
    this.processingDlq = new sqs.Queue(this, "ProcessingDLQ", {
      queueName: "processing-dlq",

      // Максимально возможное retention (14 дней) для DLQ
      retentionPeriod: Duration.days(14),

      // Шифрование через SQS-managed keys (SSE-SQS).
      // В production с PII → использовать CMK через KMS.
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // ─── Processing Queue (основная) ─────────────────────────────────────────
    // S3 Event Notifications будут публиковать сюда события ObjectCreated.
    // Lambda s3-event-orchestrator (Этап 17) читает отсюда через Event Source Mapping.
    this.processingQueue = new sqs.Queue(this, "ProcessingQueue", {
      queueName: "processing-queue",

      // Visibility timeout = 15 минут (900 секунд).
      // Равно максимальному timeout Lambda (900 сек).
      // Если Lambda работает 14 минут и упадёт — сообщение станет видимым
      // только ПОСЛЕ того как Lambda таймаутнулась, не раньше.
      visibilityTimeout: Duration.minutes(15),

      // Long polling: SQS держит соединение до 20 сек ожидая новые сообщения.
      // Меньше пустых запросов → дешевле.
      // Lambda Event Source Mapping использует это автоматически.
      receiveMessageWaitTime: Duration.seconds(20),

      // Retention: 4 дня по умолчанию.
      // Если сообщение не обработано за 4 дня → удаляется.
      retentionPeriod: Duration.days(4),

      // Redrive policy:
      //   queue   — DLQ куда переместить "мёртвые" сообщения
      //   maxReceiveCount — после скольких неудачных receive → в DLQ
      //
      // maxReceiveCount = 3:
      //   Попытка 1: Lambda → ошибка → receiveCount = 1 → обратно в очередь
      //   Попытка 2: Lambda → ошибка → receiveCount = 2 → обратно в очередь
      //   Попытка 3: Lambda → ошибка → receiveCount = 3 → УХОДИТ В DLQ
      deadLetterQueue: {
        queue: this.processingDlq,
        maxReceiveCount: 3,
      },

      // Шифрование
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // ─── SQS Resource Policy — разрешаем S3 публиковать в очередь ────────────
    // Политика добавляется ЗДЕСЬ (в MessagingStack), а не через SqsDestination,
    // чтобы избежать CDK circular dependency:
    //   StorageStack → MessagingStack (bucket notification ссылается на queueArn)
    //   MessagingStack → StorageStack (queue policy ссылается на bucketArn) ← ЦИКЛ!
    //
    // Используем aws:SourceAccount вместо aws:SourceArn (bucket ARN):
    //   - Не создаёт cross-stack reference → нет цикла
    //   - Достаточно безопасно: разрешает только S3 из нашего аккаунта
    //   - В production с несколькими bucket можно добавить aws:SourceArn
    //     через SSM Parameter Store (не через CDK cross-stack ref)
    this.processingQueue.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowS3SendMessage",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("s3.amazonaws.com")],
        actions: ["sqs:SendMessage"],
        resources: [this.processingQueue.queueArn],
        conditions: {
          StringEquals: { "aws:SourceAccount": this.account },
        },
      }),
    );

    // ─── CloudWatch Alarm на DLQ ──────────────────────────────────────────────
    // Срабатывает когда в DLQ появляется хотя бы 1 сообщение.
    // Это сигнал: "есть poison pill или системная ошибка — нужно разобраться".
    //
    // ApproximateNumberOfMessagesVisible — количество видимых сообщений в очереди.
    // Метрика может быть с небольшой задержкой (eventual consistency).
    const dlqAlarm = new cw.Alarm(this, "DLQMessagesAlarm", {
      alarmName: "processing-dlq-messages-visible",
      alarmDescription:
        "Сообщения появились в DLQ — Lambda не смогла обработать после 3 попыток",

      metric: this.processingDlq.metricApproximateNumberOfMessagesVisible({
        // Период 1 минута: быстрое обнаружение проблем
        period: Duration.minutes(1),
        // Сумма за период (для очереди используем Maximum или Sum)
        statistic: "Maximum",
      }),

      // Порог: > 0 сообщений → ALARM
      threshold: 0,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,

      // 1 из 1 периодов превысил порог → сразу ALARM (без ложных срабатываний)
      evaluationPeriods: 1,

      // Если данных нет (очередь только создана) → не сигнализировать
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });

    // ─── CloudFormation Outputs ───────────────────────────────────────────────
    // Выводим ARN и URL для использования в других стеках и тестировании

    new cdk.CfnOutput(this, "ProcessingQueueUrl", {
      value: this.processingQueue.queueUrl,
      description: "URL основной очереди обработки документов",
      exportName: "ProcessingQueueUrl",
    });

    new cdk.CfnOutput(this, "ProcessingQueueArn", {
      value: this.processingQueue.queueArn,
      description: "ARN основной очереди (нужен для S3 Event Notification)",
      exportName: "ProcessingQueueArn",
    });

    new cdk.CfnOutput(this, "ProcessingDLQUrl", {
      value: this.processingDlq.queueUrl,
      description: "URL Dead Letter Queue",
      exportName: "ProcessingDLQUrl",
    });

    new cdk.CfnOutput(this, "DLQAlarmName", {
      value: dlqAlarm.alarmName,
      description: "Имя CloudWatch Alarm на DLQ",
    });
  }
}
