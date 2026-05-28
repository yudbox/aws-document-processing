import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

// ─── Клиенты инициализируются вне handler ────────────────────────────────────
// При warm invocation они переиспользуются → экономия времени и памяти.
// Lambda автоматически получает credentials из IAM роли (не нужно передавать вручную).
const s3Client = new S3Client({});
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// ─── Конфигурация из env vars ────────────────────────────────────────────────
// Имена ресурсов задаются через CDK environment — никогда не хардкодим.
const BUCKET_NAME = process.env.BUCKET_NAME!;
const TABLE_NAME = process.env.TABLE_NAME!;
const PRESIGNED_URL_EXPIRES = parseInt(
  process.env.PRESIGNED_URL_EXPIRES ?? "3600",
);

// ─── Допустимые типы файлов ───────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "image/png",
  "image/jpeg",
]);

// 500 MB — максимальный размер для загрузки через pre-signed PUT URL.
// Файлы больше 5 GB потребовали бы Multipart Upload (отдельная логика).
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

// ─── Типы ────────────────────────────────────────────────────────────────────
interface UploadUrlRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  userEmail: string;
}

// Совместимо с API Gateway HTTP API proxy integration (этап 11).
// Lambda может вызываться напрямую (тест) или через API Gateway (продакшн).
interface LambdaEvent {
  body?: string | UploadUrlRequest;
  // Прямой вызов (тест через AWS Console / CLI): поля верхнего уровня
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  userEmail?: string;
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export const handler = async (event: LambdaEvent) => {
  try {
    // Парсим тело запроса.
    // API Gateway передаёт body как строку (JSON.stringify).
    // При прямом вызове Lambda — объект верхнего уровня или уже распарсенный body.
    let body: UploadUrlRequest;
    if (event.body) {
      body =
        typeof event.body === "string"
          ? (JSON.parse(event.body) as UploadUrlRequest)
          : event.body;
    } else {
      // Прямой вызов для тестирования
      body = {
        fileName: event.fileName!,
        fileSize: event.fileSize!,
        mimeType: event.mimeType!,
        userEmail: event.userEmail!,
      };
    }

    const { fileName, fileSize, mimeType, userEmail } = body;

    // ─── Валидация входных данных ─────────────────────────────────────────────
    if (!fileName || !fileSize || !mimeType || !userEmail) {
      return httpResponse(400, {
        error: "Missing required fields",
        required: ["fileName", "fileSize", "mimeType", "userEmail"],
      });
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return httpResponse(400, {
        error: `Unsupported file type: ${mimeType}`,
        allowedTypes: [...ALLOWED_MIME_TYPES],
      });
    }

    if (fileSize <= 0 || fileSize > MAX_FILE_SIZE_BYTES) {
      return httpResponse(400, {
        error: `Invalid fileSize: ${fileSize}. Must be between 1 and ${MAX_FILE_SIZE_BYTES} bytes (500 MB)`,
      });
    }

    // ─── Генерация documentId и S3 ключа ─────────────────────────────────────
    // randomUUID() — нативный Node.js (без npm пакетов), 122 бит случайности.
    const documentId = randomUUID();
    const now = new Date().toISOString();

    // Структура ключа: uploads/{documentId}/{originalFileName}
    // Prefix "uploads/" используется в S3 Event Notification filter (этап 16).
    const s3Key = `uploads/${documentId}/${fileName}`;

    // ─── Pre-signed PUT URL ───────────────────────────────────────────────────
    // ContentType + ContentLength зафиксированы в подписи:
    // клиент ОБЯЗАН отправить именно эти заголовки — иначе S3 вернёт 403.
    const presignedUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        ContentType: mimeType,
        ContentLength: fileSize,
      }),
      { expiresIn: PRESIGNED_URL_EXPIRES },
    );

    // ─── DynamoDB: две записи в одной транзакции ──────────────────────────────
    // Транзакция гарантирует атомарность: либо обе записи созданы, либо ни одна.
    //
    // Запись 1: DOC#{id}/METADATA — основная запись документа.
    //   Используется в AP1 (GetItem по documentId) и AP5 (UpdateItem статуса).
    //
    // Запись 2: USER#{email}/DOC#{timestamp}#{id} — индекс пользователя.
    //   Используется в AP2 (Query всех документов пользователя с пагинацией).
    //   SK содержит timestamp → сортировка по дате "из коробки".
    //
    // expiresAt (TTL): если клиент не загрузит файл за 1 час,
    //   DynamoDB автоматически удалит запись (экономия на хранении "брошенных" документов).
    const expiresAt = Math.floor(Date.now() / 1000) + PRESIGNED_URL_EXPIRES;

    await dynamoClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              // ConditionExpression защищает от дубликатов (idempotency).
              // Если запись с таким documentId уже есть — транзакция упадёт.
              ConditionExpression:
                "attribute_not_exists(PK) AND attribute_not_exists(SK)",
              Item: {
                PK: `DOC#${documentId}`,
                SK: "METADATA",
                documentId,
                fileName,
                fileSize,
                mimeType,
                userEmail,
                s3Bucket: BUCKET_NAME,
                s3Key,
                status: "pending_upload",
                createdAt: now,
                updatedAt: now,
                expiresAt, // TTL: автоудаление если файл так и не загружен
              },
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: {
                PK: `USER#${userEmail}`,
                SK: `DOC#${now}#${documentId}`, // ISO timestamp → сортировка по дате
                documentId,
                fileName,
                fileSize,
                status: "pending_upload",
                createdAt: now,
                expiresAt, // TTL: удалить вместе с основной записью
              },
            },
          },
        ],
      }),
    );

    // ─── Ответ клиенту ────────────────────────────────────────────────────────
    return httpResponse(200, {
      documentId,
      uploadUrl: presignedUrl, // клиент делает HTTP PUT на этот URL
      expiresIn: PRESIGNED_URL_EXPIRES,
      s3Key, // полезно для отладки
    });
  } catch (error) {
    console.error("Error in upload-url handler:", error);
    return httpResponse(500, { error: "Internal server error" });
  }
};

// ─── Вспомогательная функция ─────────────────────────────────────────────────
// Формат ответа совместим с API Gateway HTTP API proxy integration.
function httpResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // CORS: разрешаем любой origin (для pet-project).
      // В production нужно ограничить до конкретного домена.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify(body),
  };
}
