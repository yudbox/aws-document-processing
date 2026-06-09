import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

// ─── Клиенты инициализируются вне handler ────────────────────────────────────
const s3Client = new S3Client({});
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// ─── Конфигурация ─────────────────────────────────────────────────────────────
const TABLE_NAME = process.env.TABLE_NAME!;
const RESULTS_BUCKET = process.env.RESULTS_BUCKET!;
const DOWNLOAD_URL_EXPIRES = parseInt(
  process.env.DOWNLOAD_URL_EXPIRES ?? "900", // 15 минут — короче чем upload (безопаснее)
);

if (!TABLE_NAME || !RESULTS_BUCKET) {
  throw new Error(
    "TABLE_NAME and RESULTS_BUCKET environment variables are required",
  );
}

// ─── Допустимые типы результатов ─────────────────────────────────────────────
// text      → полный текст документа
// thumbnail → превью (PNG первой страницы)
// metadata  → JSON с мета-данными (количество страниц, слов и т.д.)
const VALID_TYPES = ["text", "thumbnail", "metadata"] as const;
type ResultType = (typeof VALID_TYPES)[number];

// Маппинг типа → S3 ключ и имя файла для скачивания
const TYPE_CONFIG: Record<
  ResultType,
  { s3Suffix: string; fileName: string; contentType: string }
> = {
  text: {
    s3Suffix: "text.txt",
    fileName: "result.txt",
    contentType: "text/plain",
  },
  thumbnail: {
    s3Suffix: "thumb.png",
    fileName: "thumbnail.png",
    contentType: "image/png",
  },
  metadata: {
    s3Suffix: "metadata.json",
    fileName: "metadata.json",
    contentType: "application/json",
  },
};

// ─── Handler ──────────────────────────────────────────────────────────────────
export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const documentId = event.pathParameters?.documentId;
    const type = event.queryStringParameters?.type;

    // ─── Шаг 1: валидация обязательных параметров ─────────────────────────────
    if (!documentId) {
      return httpResponse(400, { error: "documentId is required" });
    }

    if (!type) {
      return httpResponse(400, {
        error: "type query parameter is required",
        allowed: VALID_TYPES,
      });
    }

    if (!VALID_TYPES.includes(type as ResultType)) {
      return httpResponse(400, {
        error: `Invalid type: "${type}". Must be one of: ${VALID_TYPES.join(", ")}`,
        allowed: VALID_TYPES,
      });
    }

    const resultType = type as ResultType;

    // ─── Шаг 2: проверить документ в DynamoDB ─────────────────────────────────
    // GetItem по PK=DOC#{id}, SK=METADATA — O(1) поиск.
    // Проверяем: существует ли документ и готовы ли результаты (status=completed).
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `DOC#${documentId}`,
          SK: "METADATA",
        },
      }),
    );

    if (!result.Item) {
      return httpResponse(404, { error: "Document not found" });
    }

    const item = result.Item;
    const status = item.status as string;

    // Результаты доступны только для completed документов.
    // pending_upload, processing, failed → 409 Conflict.
    // 409 точнее чем 404: документ существует, но состояние не позволяет скачать.
    if (status !== "completed") {
      return httpResponse(409, {
        error: "Document results are not ready",
        status,
        hint:
          status === "pending_upload"
            ? "File has not been uploaded yet"
            : status === "processing"
              ? "Document is still being processed"
              : "Document processing failed",
      });
    }

    // ─── Шаг 3: сгенерировать pre-signed GET URL ───────────────────────────────
    // S3 ключ для результата: results/{documentId}/{suffix}
    // Структура создаётся Lambda-обработчиком (Этапы 22-25).
    const config = TYPE_CONFIG[resultType];
    const s3Key = `results/${documentId}/${config.s3Suffix}`;

    // ResponseContentDisposition: подсказывает браузеру скачать файл с нужным именем.
    // ResponseContentType: явно задаём MIME type (не зависим от метаданных объекта).
    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: RESULTS_BUCKET,
        Key: s3Key,
        ResponseContentDisposition: `attachment; filename="${config.fileName}"`,
        ResponseContentType: config.contentType,
      }),
      { expiresIn: DOWNLOAD_URL_EXPIRES },
    );

    // ─── Шаг 4: вернуть URL клиенту ───────────────────────────────────────────
    // Возвращаем JSON с URL, а не 302 Redirect — проще тестировать через curl/Postman.
    // Мобильные/SPA клиенты сами решают когда начать скачивание.
    // Если нужен 302 — достаточно заменить на: { statusCode: 302, headers: { Location: downloadUrl } }
    return httpResponse(200, {
      downloadUrl,
      expiresIn: DOWNLOAD_URL_EXPIRES,
      documentId,
      type: resultType,
      fileName: config.fileName,
    });
  } catch (error) {
    console.error("Error in download-result handler:", error);
    return httpResponse(500, { error: "Internal server error" });
  }
};

// ─── Вспомогательная функция ──────────────────────────────────────────────────
function httpResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
