import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME!;

if (!TABLE_NAME) {
  throw new Error("TABLE_NAME environment variable is not set");
}

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const documentId = event.pathParameters?.documentId;

    if (!documentId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "documentId is required" }),
      };
    }

    // GetItem по PK=DOC#{documentId}, SK=METADATA — O(1), пряме звернення по ключу.
    // upload-url створює саме такий запис (Single Table Design, AP1).
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
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Document not found" }),
      };
    }

    const item = result.Item;
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: item.documentId,
        fileName: item.fileName,
        fileSize: item.fileSize,
        mimeType: item.mimeType,
        userEmail: item.userEmail,
        status: item.status,
        s3Key: item.s3Key,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt || item.createdAt,
      }),
    };
  } catch (error) {
    console.error("Error retrieving document:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
