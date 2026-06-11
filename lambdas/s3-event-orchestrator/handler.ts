import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { SQSEvent, SQSHandler, SQSBatchResponse } from "aws-lambda";

// ─── Клиенты инициализируются вне handler ────────────────────────────────────
// При warm invocation переиспользуются → экономия времени и памяти.
const sfnClient = new SFNClient({});

// ─── Конфигурация из env vars ────────────────────────────────────────────────
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN!;

// ─── Типы ────────────────────────────────────────────────────────────────────

interface S3EventRecord {
  eventName: string;
  s3: {
    bucket: { name: string };
    object: { key: string; size: number };
  };
}

interface DocumentInfo {
  bucket: string;
  key: string;
  size: number;
  documentId: string;
  fileName: string;
}

// ─── Парсинг S3 события из тела SQS сообщения ────────────────────────────────
// Структура вложенности:
//   SQSEvent.Records[]          ← массив SQS сообщений
//     .body (string)            ← JSON строка
//       .Records[]              ← массив S3 событий (обычно 1)
//         .s3.bucket.name
//         .s3.object.key        ← URL-encoded!
//         .s3.object.size

function parseS3Record(body: string): S3EventRecord | null {
  let parsed: { Records?: S3EventRecord[]; Event?: string };

  try {
    parsed = JSON.parse(body);
  } catch {
    console.error("Failed to parse SQS body as JSON:", body.slice(0, 200));
    return null;
  }

  // S3 Test Event — отправляется при настройке уведомлений, нужно игнорировать
  if (parsed.Event === "s3:TestEvent") {
    console.log("Received S3 test event, skipping");
    return null;
  }

  const s3Record = parsed.Records?.[0];
  if (!s3Record) {
    console.warn("No S3 Records in body:", body.slice(0, 200));
    return null;
  }

  return s3Record;
}

// ─── Извлечение информации о документе из S3 ключа ───────────────────────────
// Ключ вида: uploads/{documentId}/{fileName}
// S3 URL-кодирует ключ — нужно decodeURIComponent + замена + на пробел

function extractDocumentInfo(s3Record: S3EventRecord): DocumentInfo {
  const bucket = s3Record.s3.bucket.name;

  // S3 кодирует ключ: пробелы → "+", спецсимволы → "%XX"
  const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, " "));
  const size = s3Record.s3.object.size;

  // Структура: uploads/{documentId}/{fileName}
  const keyParts = key.split("/");
  const documentId = keyParts[1]; // "abc-123-uuid"
  const fileName = keyParts.slice(2).join("/"); // "my invoice.pdf"

  return { bucket, key, size, documentId, fileName };
}

// ─── Handler ──────────────────────────────────────────────────────────────────
// Принимает SQS event (batch до 10 сообщений от ESM).
// Возвращает batchItemFailures — список messageId сообщений которые не удалось обработать.
// AWS повторит только неудачные; успешные удалит автоматически.

export const handler: SQSHandler = async (
  event: SQSEvent,
): Promise<SQSBatchResponse> => {
  const failedItems: { itemIdentifier: string }[] = [];

  console.log(`Processing batch of ${event.Records.length} SQS messages`);

  for (const sqsRecord of event.Records) {
    const { messageId } = sqsRecord;

    try {
      // 1. Парсим S3 событие из тела SQS сообщения
      const s3Record = parseS3Record(sqsRecord.body);
      if (!s3Record) {
        // Test event или невалидные данные — считаем успешными, не retry
        console.log(`Skipping messageId=${messageId} (no valid S3 record)`);
        continue;
      }

      // 2. Извлекаем метаданные документа
      const { bucket, key, size, documentId, fileName } =
        extractDocumentInfo(s3Record);

      if (!documentId) {
        console.warn(
          `Cannot extract documentId from key="${key}", skipping messageId=${messageId}`,
        );
        continue;
      }

      console.log(
        `Starting workflow: documentId=${documentId}, fileName=${fileName}, size=${size}`,
      );

      // 3. Запускаем Step Functions execution
      // name = "doc-{documentId}" обеспечивает idempotency:
      // повторный вызов с тем же documentId вернёт ExecutionAlreadyExists
      await sfnClient.send(
        new StartExecutionCommand({
          stateMachineArn: STATE_MACHINE_ARN,
          name: `doc-${documentId}`,
          input: JSON.stringify({
            documentId,
            bucket,
            key,
            size,
            fileName,
          }),
        }),
      );

      console.log(
        `Successfully started execution for documentId=${documentId}`,
      );
    } catch (err: unknown) {
      // ExecutionAlreadyExists — не ошибка, SQS доставил дубль сообщения
      if (
        err instanceof Error &&
        (err.name === "ExecutionAlreadyExists" ||
          (err as { __type?: string }).__type === "ExecutionAlreadyExists")
      ) {
        console.log(
          `Execution already exists for messageId=${messageId}, skipping`,
        );
        continue;
      }

      // Реальная ошибка — добавляем в список неудачных для retry
      console.error(
        `Failed to process messageId=${messageId}:`,
        err instanceof Error ? err.message : String(err),
      );
      failedItems.push({ itemIdentifier: messageId });
    }
  }

  if (failedItems.length > 0) {
    console.warn(
      `Batch partially failed: ${failedItems.length}/${event.Records.length} messages`,
    );
  }

  // Возвращаем только неудачные → AWS сам удалит успешные из очереди
  return { batchItemFailures: failedItems };
};
