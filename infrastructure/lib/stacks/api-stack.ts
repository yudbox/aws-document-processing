import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  HttpApi,
  CorsHttpMethod,
  HttpMethod,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { LambdaStack } from "./lambda-stack";

interface ApiStackProps extends cdk.StackProps {
  lambdaStack: LambdaStack;
}

/**
 * ApiStack — HTTP API Gateway v2 для Фазы 2 (Upload Flow).
 *
 * Выбор HTTP API, а не REST API:
 *   - HTTP API дешевле (~71%): $1.00/млн запросов vs $3.50/млн
 *   - Меньше latency: нет маппингов и трансформаций запросов
 *   - Lambda Proxy Integration работает "из коробки"
 *   - Для pet-project всех возможностей HTTP API достаточно
 *
 * CORS:
 *   - allow origin "*" — подходит для pet-project
 *   - В продакшне заменить на конкретный домен клиента
 */
export class ApiStack extends cdk.Stack {
  /** URL задеплоенного API (вида https://abc123.execute-api.eu-central-1.amazonaws.com) */
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { lambdaStack } = props;

    // ─── HTTP API ─────────────────────────────────────────────────────────────
    // HttpApi автоматически создаёт stage "$default" с auto-deploy.
    // "$default" — специальный stage, URL не содержит суффикса /stage.
    const httpApi = new HttpApi(this, "DocumentProcessingApi", {
      apiName: "document-processing-api",
      description: "API for Document Processing Platform (Stage 11)",

      // CORS конфигурация.
      // API Gateway отвечает на OPTIONS preflight сам — Lambda не получает OPTIONS запросы.
      corsPreflight: {
        // Разрешаем запросы с любого origin (для pet-project)
        allowOrigins: ["*"],
        // Методы которые использует клиент
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.OPTIONS,
        ],
        // Заголовки которые клиент может послать
        allowHeaders: ["Content-Type", "Authorization"],
        // Кэш preflight ответа на 1 час (300 секунд)
        maxAge: cdk.Duration.seconds(300),
      },
    });

    // ─── Lambda интеграция ────────────────────────────────────────────────────
    // HttpLambdaIntegration = Lambda Proxy Integration.
    // API Gateway передаёт весь HTTP запрос в Lambda event (path, headers, body и т.д.)
    // и ожидает от Lambda ответ вида { statusCode, headers, body }.
    const uploadUrlIntegration = new HttpLambdaIntegration(
      "UploadUrlIntegration",
      lambdaStack.uploadUrlHandler,
    );

    // ─── Роут: POST /api/documents/upload-url ─────────────────────────────────
    // Клиент делает POST с {fileName, fileSize, mimeType, userEmail} в теле запроса.
    // Lambda генерирует pre-signed URL и documentId, возвращает их клиенту.
    httpApi.addRoutes({
      path: "/api/documents/upload-url",
      methods: [HttpMethod.POST],
      integration: uploadUrlIntegration,
    });

    this.apiUrl = httpApi.apiEndpoint;

    // ─── Output ───────────────────────────────────────────────────────────────
    // CfnOutput выводит значение после cdk deploy в консоль и сохраняет в CloudFormation.
    // exportName позволяет другим стекам ссылаться на этот URL через Fn::ImportValue.
    new cdk.CfnOutput(this, "ApiUrl", {
      value: httpApi.apiEndpoint,
      description: "HTTP API endpoint URL",
      exportName: "DocProcess-ApiUrl",
    });
  }
}
