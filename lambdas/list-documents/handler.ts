import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

// ─── Клиенты инициализируются вне handler ────────────────────────────────────
// При warm invocation они переиспользуются → экономия времени и памяти.
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// ─── Конфигурация ─────────────────────────────────────────────────────────────
const TABLE_NAME = process.env.TABLE_NAME!;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

if (!TABLE_NAME) {
  throw new Error("TABLE_NAME environment variable is not set");
}

// ─── Тип для DynamoDB LastEvaluatedKey / ExclusiveStartKey ───────────────────
// Все значения DynamoDB ключей — строки, числа или бинарные данные.
type DynamoKey = Record<string, string | number | Uint8Array>;

// ─── Тип одного элемента в списке ────────────────────────────────────────────
interface DocumentListItem {
  documentId: string;
  fileName: string;
  fileSize: number;
  status: string;
  createdAt: string;
}

// ─── Cursor encoding / decoding ───────────────────────────────────────────────
// LastEvaluatedKey — JSON объект. Передаём его клиенту в base64url:
//   - base64url безопасен в URL (нет +, /, =)
//   - скрывает внутреннюю структуру ключа от клиента
function encodeCursor(key: DynamoKey): string {
  return Buffer.from(JSON.stringify(key)).toString("base64url");
}

function decodeCursor(cursor: string): DynamoKey {
  return JSON.parse(
    Buffer.from(cursor, "base64url").toString("utf-8"),
  ) as DynamoKey;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const params = event.queryStringParameters ?? {};
    const userEmail = params.userEmail;
    const limitStr = params.limit ?? String(DEFAULT_LIMIT);
    const cursorParam = params.cursor;

    // ─── Валидация ─────────────────────────────────────────────────────────────
    if (!userEmail) {
      return httpResponse(400, {
        error: "userEmail query parameter is required",
      });
    }

    if (!userEmail.includes("@")) {
      return httpResponse(400, { error: "Invalid userEmail format" });
    }

    const limit = parseInt(limitStr, 10);
    if (isNaN(limit) || limit < 1 || limit > MAX_LIMIT) {
      return httpResponse(400, {
        error: `Invalid limit: must be between 1 and ${MAX_LIMIT}`,
      });
    }

    // ─── Декодирование cursor ──────────────────────────────────────────────────
    // ExclusiveStartKey = LastEvaluatedKey предыдущего ответа.
    // Если cursor невалидный — возвращаем 400 (не 500).
    let exclusiveStartKey: DynamoKey | undefined;
    if (cursorParam) {
      try {
        exclusiveStartKey = decodeCursor(cursorParam);
      } catch {
        return httpResponse(400, { error: "Invalid cursor" });
      }
    }

    // ─── DynamoDB Query ────────────────────────────────────────────────────────
    // PK = USER#{userEmail} — доступ ко всем документам пользователя.
    // SK начинается с "DOC#{ISO-timestamp}" → сортировка по дате "из коробки".
    // ScanIndexForward: false → новые документы первыми (DESC).
    // Нет FilterExpression → Limit работает предсказуемо (ровно N документов).
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `USER#${userEmail}`,
        },
        Limit: limit,
        ScanIndexForward: false,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    // ─── Формирование ответа ───────────────────────────────────────────────────
    // USER# записи содержат: documentId, fileName, fileSize, status, createdAt.
    // Поля берутся явно — не передаём PK/SK/expiresAt клиенту.
    const items: DocumentListItem[] = (result.Items ?? []).map((item) => ({
      documentId: item.documentId as string,
      fileName: item.fileName as string,
      fileSize: item.fileSize as number,
      status: item.status as string,
      createdAt: item.createdAt as string,
    }));

    // LastEvaluatedKey присутствует → есть следующая страница.
    // Отсутствует → это последняя страница.
    const nextKey = result.LastEvaluatedKey as DynamoKey | undefined;
    const nextCursor = nextKey ? encodeCursor(nextKey) : null;

    return httpResponse(200, {
      items,
      nextCursor,
      hasMore: nextCursor !== null,
    });
  } catch (error) {
    console.error("Error in list-documents handler:", error);
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
