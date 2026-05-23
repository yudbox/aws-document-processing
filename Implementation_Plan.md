# 🗺️ Document Processing Platform — План реализации по этапам

> **Источник:** [Project_DocumentProcessing.md](./Project_DocumentProcessing.md)
> **Цель:** Разбить проект на максимально мелкие логические этапы. Каждый этап = одна изолированная зона ответственности, которую можно изучить → реализовать → протестировать → закоммитить.
> **Формат каждого этапа:**
>
> 1. 📚 **Темы для изучения** — список заголовков (без теории), которые нужно прочитать ПЕРЕД реализацией.
> 2. 🛠️ **Реализация** — что конкретно делаем в этом этапе.

---

## 📑 Содержание

### Фаза 0. Подготовка окружения

- [Этап 1. Установка инструментов и AWS CLI](#этап-1-установка-инструментов-и-aws-cli)
- [Этап 2. Создание AWS аккаунта и IAM пользователя](#этап-2-создание-aws-аккаунта-и-iam-пользователя)
- [Этап 3. Инициализация CDK проекта](#этап-3-инициализация-cdk-проекта)
- [Этап 4. Структура монорепозитория](#этап-4-структура-монорепозитория)
- [Этап 5. CDK Bootstrap региона](#этап-5-cdk-bootstrap-региона)

### Фаза 1. Базовая инфраструктура (Storage + Data)

- [Этап 6. S3 bucket для raw документов](#этап-6-s3-bucket-для-raw-документов)
- [Этап 7. S3 bucket для результатов обработки](#этап-7-s3-bucket-для-результатов-обработки)
- [Этап 8. DynamoDB таблица (Single Table Design)](#этап-8-dynamodb-таблица-single-table-design)
- [Этап 9. Базовые IAM роли](#этап-9-базовые-iam-роли)

### Фаза 2. Upload Flow (клиент → S3)

- [Этап 10. Lambda `upload-url-handler` — генерация pre-signed URL](#этап-10-lambda-upload-url-handler--генерация-pre-signed-url)
- [Этап 11. API Gateway REST API и базовый роут](#этап-11-api-gateway-rest-api-и-базовый-роут)
- [Этап 12. Lambda `get-document-handler` — статус по ID](#этап-12-lambda-get-document-handler--статус-по-id)
- [Этап 13. Lambda `list-documents-handler` — cursor pagination](#этап-13-lambda-list-documents-handler--cursor-pagination)
- [Этап 14. Lambda `download-result-handler` — pre-signed URL для скачивания](#этап-14-lambda-download-result-handler--pre-signed-url-для-скачивания)

### Фаза 3. Event-Driven Pipeline (S3 → SQS → Lambda)

- [Этап 15. SQS очередь + Dead Letter Queue](#этап-15-sqs-очередь--dead-letter-queue)
- [Этап 16. S3 Event Notifications → SQS](#этап-16-s3-event-notifications--sqs)
- [Этап 17. Lambda `s3-event-orchestrator` — consumer SQS](#этап-17-lambda-s3-event-orchestrator--consumer-sqs)

### Фаза 4. Step Functions — оркестрация

- [Этап 18. Базовая Step Functions State Machine (skeleton)](#этап-18-базовая-step-functions-state-machine-skeleton)
- [Этап 19. Lambda `validate-document` — Task state](#этап-19-lambda-validate-document--task-state)
- [Этап 20. Choice state — routing по размеру файла](#этап-20-choice-state--routing-по-размеру-файла)
- [Этап 21. Lambda `process-with-lambda` — small files (<50MB)](#этап-21-lambda-process-with-lambda--small-files-50mb)
- [Этап 22. Lambda `extract-metadata`](#этап-22-lambda-extract-metadata)
- [Этап 23. Lambda `generate-thumbnail`](#этап-23-lambda-generate-thumbnail)
- [Этап 24. Parallel state — параллельное выполнение extract + thumbnail](#этап-24-parallel-state--параллельное-выполнение-extract--thumbnail)
- [Этап 25. Lambda `save-results` — финальное сохранение в DynamoDB](#этап-25-lambda-save-results--финальное-сохранение-в-dynamodb)

### Фаза 5. Notifications

- [Этап 26. SNS topic для completed/failed](#этап-26-sns-topic-для-completedfailed)
- [Этап 27. Lambda `send-notification` — публикация в SNS](#этап-27-lambda-send-notification--публикация-в-sns)
- [Этап 28. Email subscription на SNS](#этап-28-email-subscription-на-sns)

### Фаза 6. ECS Fargate — обработка medium файлов (50-500MB)

- [Этап 29. Docker image для обработки документов](#этап-29-docker-image-для-обработки-документов)
- [Этап 30. ECR repository + push image](#этап-30-ecr-repository--push-image)
- [Этап 31. ECS Cluster + Task Definition (Fargate)](#этап-31-ecs-cluster--task-definition-fargate)
- [Этап 32. Step Functions integration с ECS `runTask.sync`](#этап-32-step-functions-integration-с-ecs-runtasksync)

### Фаза 7. AWS Batch — bulk processing (>500MB или массово)

- [Этап 33. AWS Batch Compute Environment (Fargate Spot)](#этап-33-aws-batch-compute-environment-fargate-spot)
- [Этап 34. AWS Batch Job Queue](#этап-34-aws-batch-job-queue)
- [Этап 35. AWS Batch Job Definition](#этап-35-aws-batch-job-definition)
- [Этап 36. Step Functions integration с Batch `submitJob.sync`](#этап-36-step-functions-integration-с-batch-submitjobsync)

### Фаза 8. Saga Pattern + Error Handling

- [Этап 37. Step Functions Retry policies](#этап-37-step-functions-retry-policies)
- [Этап 38. Catch states + compensating actions (cleanup)](#этап-38-catch-states--compensating-actions-cleanup)
- [Этап 39. Lambda `cleanup-failed-document` — Saga compensation](#этап-39-lambda-cleanup-failed-document--saga-compensation)
- [Этап 40. Idempotency keys в Lambda handlers](#этап-40-idempotency-keys-в-lambda-handlers)

### Фаза 9. Bulk Upload (AWS Batch Array Jobs)

- [Этап 41. Lambda `bulk-upload-handler` — создание batch записей](#этап-41-lambda-bulk-upload-handler--создание-batch-записей)
- [Этап 42. AWS Batch Array Job — параллельная обработка](#этап-42-aws-batch-array-job--параллельная-обработка)
- [Этап 43. Aggregator Lambda — статус всего batch](#этап-43-aggregator-lambda--статус-всего-batch)

### Фаза 10. Observability

- [Этап 44. CloudWatch Logs для всех Lambda и ECS](#этап-44-cloudwatch-logs-для-всех-lambda-и-ecs)
- [Этап 45. CloudWatch Metrics + custom metrics](#этап-45-cloudwatch-metrics--custom-metrics)
- [Этап 46. CloudWatch Alarms](#этап-46-cloudwatch-alarms)
- [Этап 47. AWS X-Ray distributed tracing](#этап-47-aws-x-ray-distributed-tracing)
- [Этап 48. Structured logging (JSON)](#этап-48-structured-logging-json)

### Фаза 11. Cost Optimization

- [Этап 49. Lambda memory tuning](#этап-49-lambda-memory-tuning)
- [Этап 50. Lambda Provisioned Concurrency (опционально)](#этап-50-lambda-provisioned-concurrency-опционально)
- [Этап 51. S3 Lifecycle policies](#этап-51-s3-lifecycle-policies)
- [Этап 52. Fargate Spot для Batch](#этап-52-fargate-spot-для-batch)

### Фаза 12. Тестирование

- [Этап 53. Unit-тесты для Lambda handlers](#этап-53-unit-тесты-для-lambda-handlers)
- [Этап 54. Integration tests (LocalStack или AWS SDK Mock)](#этап-54-integration-tests-localstack-или-aws-sdk-mock)
- [Этап 55. End-to-end ручной тест через Postman](#этап-55-end-to-end-ручной-тест-через-postman)
- [Этап 56. Load test (Artillery / k6)](#этап-56-load-test-artillery--k6)

### Фаза 13. Документация и финал

- [Этап 57. README с архитектурной диаграммой](#этап-57-readme-с-архитектурной-диаграммой)
- [Этап 58. ADR (Architecture Decision Records)](#этап-58-adr-architecture-decision-records)
- [Этап 59. Финальная проверка и cleanup ресурсов](#этап-59-финальная-проверка-и-cleanup-ресурсов)

---

## Фаза 0. Подготовка окружения

### Этап 1. Установка инструментов и AWS CLI

**📚 Темы для изучения:**

- Что такое AWS CLI и зачем он нужен
- Что такое AWS CDK (Cloud Development Kit)
- Версии Node.js LTS (что такое LTS, зачем он)
- Менеджеры версий Node (nvm / fnm / volta)
- Что такое Docker Desktop и зачем он для AWS Batch/ECS

**🛠️ Реализация:**

- Установить Node.js LTS (18+)
- Установить AWS CLI v2
- Установить AWS CDK CLI глобально (`npm install -g aws-cdk`)
- Установить Docker Desktop
- Проверить версии: `aws --version`, `cdk --version`, `node --version`, `docker --version`

---

### Этап 2. Создание AWS аккаунта и IAM пользователя

**📚 Темы для изучения:**

- AWS Free Tier — что входит, лимиты
- AWS Account vs IAM User vs IAM Role
- IAM политики: managed vs inline
- AWS Access Keys vs Session Tokens
- MFA (Multi-Factor Authentication)
- AWS billing alerts

**🛠️ Реализация:**

- Создать AWS аккаунт (если ещё нет)
- Включить MFA на root-аккаунте
- Создать IAM user с программным доступом (НЕ работаем под root!)
- Прикрепить managed-политику `AdministratorAccess` (на pet-проект достаточно)
- Сохранить Access Key + Secret Key в `~/.aws/credentials` через `aws configure`
- Настроить billing alert на $10 (защита от случайных трат)

---

### Этап 3. Инициализация CDK проекта

**📚 Темы для изучения:**

- CDK App / Stack / Construct — три уровня абстракции
- L1 vs L2 vs L3 конструкции CDK
- CDK languages (TypeScript предпочтительно)
- `cdk.json` — конфиг файл
- `package.json` для CDK проекта

**🛠️ Реализация:**

- Создать папку проекта `aws-document-processing/`
- Запустить `cdk init app --language typescript`
- Изучить сгенерированную структуру (`bin/`, `lib/`, `cdk.json`)
- Запустить `npm install`
- Сделать первый `cdk synth` чтобы проверить что всё работает

---

### Этап 4. Структура монорепозитория

**📚 Темы для изучения:**

- Монорепо подходы (npm workspaces / pnpm / nx / turborepo)
- Разделение infrastructure vs application code
- Best practices для Lambda кода (один handler — одна папка)
- TypeScript path aliases

**🛠️ Реализация:**

- Создать структуру:
  ```
  aws-document-processing/
  ├── infrastructure/      # CDK code (stacks)
  │   ├── bin/
  │   ├── lib/
  │   └── cdk.json
  ├── lambdas/             # Lambda handlers (TS)
  │   ├── upload-url/
  │   ├── get-document/
  │   ├── ...
  │   └── shared/          # общие утилиты
  ├── ecs-worker/          # Docker app для Fargate
  │   ├── Dockerfile
  │   └── src/
  ├── batch-worker/        # Docker app для AWS Batch
  ├── tests/
  └── package.json         # npm workspaces root
  ```
- Настроить `npm workspaces` в корневом `package.json`
- Создать общий `tsconfig.json` + `tsconfig.base.json`

---

### Этап 5. CDK Bootstrap региона

**📚 Темы для изучения:**

- Что делает `cdk bootstrap` (создаёт CDKToolkit stack)
- S3 bucket для CDK assets
- ECR repository для Docker images
- IAM роли, которые создаёт bootstrap
- Регионы AWS — что выбрать (eu-central-1 / us-east-1)

**🛠️ Реализация:**

- Выбрать регион (рекомендую `eu-central-1` для EU, `us-east-1` для глобал)
- Запустить `cdk bootstrap aws://ACCOUNT-ID/REGION`
- Проверить в AWS Console: создались S3 bucket и CloudFormation stack `CDKToolkit`

---

## Фаза 1. Базовая инфраструктура (Storage + Data)

### Этап 6. S3 bucket для raw документов

**📚 Темы для изучения:**

- S3 bucket naming rules (globally unique)
- S3 versioning, lifecycle, encryption (SSE-S3 vs SSE-KMS)
- S3 CORS configuration (для прямой загрузки с клиента)
- S3 block public access settings
- CDK `aws-cdk-lib/aws-s3` основные свойства

**🛠️ Реализация:**

- Создать `StorageStack` в CDK
- Добавить S3 bucket `docprocess-raw-bucket-{account-id}`
- Включить server-side encryption (SSE-S3)
- Настроить CORS (PUT, GET с любого origin для pet-project)
- Block all public access = true
- Lifecycle: удалять файлы старше 30 дней (cost saving)

---

### Этап 7. S3 bucket для результатов обработки

**📚 Темы для изучения:**

- Зачем разделять raw и processed buckets (разные lifecycle, разные права доступа)
- S3 prefixes как способ организации (`uploads/`, `results/`, `thumbnails/`)
- S3 Intelligent-Tiering (опционально)

**🛠️ Реализация:**

- Добавить второй bucket `docprocess-results-bucket-{account-id}`
- Та же encryption и block public access
- Lifecycle: переход в Infrequent Access через 90 дней

---

### Этап 8. DynamoDB таблица (Single Table Design)

**📚 Темы для изучения:**

- DynamoDB: Partition Key vs Sort Key
- Composite keys (PK + SK)
- Single Table Design vs многотабличный подход
- DynamoDB capacity modes: On-Demand vs Provisioned
- GSI (Global Secondary Index) vs LSI (Local Secondary Index)
- DynamoDB Streams (для event-driven)
- TTL (Time-To-Live) атрибут
- Access patterns design

**🛠️ Реализация:**

- Создать `DatabaseStack`
- Добавить таблицу `DocumentsTable` с PK=`PK` (String), SK=`SK` (String)
- Billing mode: On-Demand (для pet-project дешевле)
- Включить Point-in-Time Recovery
- Добавить GSI по `status` (для поиска всех documents in `processing`)
- Записать access patterns в комментариях кода

---

### Этап 9. Базовые IAM роли

**📚 Темы для изучения:**

- Principle of Least Privilege
- IAM Policy structure (Effect, Action, Resource, Condition)
- IAM Roles vs IAM Users
- Trust policies (кто может assume role)
- Managed vs Inline policies
- CDK Grant методы (`bucket.grantRead(lambda)`)

**🛠️ Реализация:**

- Пока НЕ создавать роли руками — будем использовать CDK `.grantRead()`, `.grantWrite()` на каждой Lambda
- Создать `SecurityStack` с общим KMS key (опционально, для CMK encryption)
- Документировать в README принцип: каждая Lambda получает минимально необходимые права

---

## Фаза 2. Upload Flow (клиент → S3)

### Этап 10. Lambda `upload-url-handler` — генерация pre-signed URL

**📚 Темы для изучения:**

- AWS Lambda: handler signature, event, context
- Lambda runtime: Node.js 20.x
- Lambda environment variables
- AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- Pre-signed URLs: как работают, expiration, методы (PUT vs POST)
- UUID generation для documentId
- CDK `NodejsFunction` construct (bundling через esbuild)

**🛠️ Реализация:**

- Создать `lambdas/upload-url/handler.ts`
- Handler принимает `{fileName, fileSize, mimeType, userEmail}`
- Генерирует `documentId` (UUID или nanoid)
- Создаёт pre-signed PUT URL на 1 час
- Записывает в DynamoDB запись `PK=USER#email, SK=DOC#id, status=pending_upload`
- Возвращает JSON с URL и documentId
- В CDK: `new NodejsFunction(...)` + `bucket.grantPut(fn)` + `table.grantWriteData(fn)`

---

### Этап 11. API Gateway REST API и базовый роут

**📚 Темы для изучения:**

- API Gateway: REST API vs HTTP API vs WebSocket API
- HTTP API дешевле и быстрее REST API (для pet-project выбрать HTTP API)
- Stages (dev / prod)
- Lambda proxy integration
- CORS на уровне API Gateway
- Request validation
- Throttling и usage plans

**🛠️ Реализация:**

- Создать `ApiStack`
- Использовать `HttpApi` из `@aws-cdk/aws-apigatewayv2-alpha`
- Подключить роут `POST /api/documents/upload-url` → `upload-url-handler`
- Включить CORS (allow `*` для pet-project)
- Вывести API URL через `CfnOutput`
- Протестировать через curl/Postman

---

### Этап 12. Lambda `get-document-handler` — статус по ID

**📚 Темы для изучения:**

- DynamoDB `GetItem` operation
- AWS SDK v3 DocumentClient (`@aws-sdk/lib-dynamodb`)
- HTTP status codes: 200 vs 202 vs 404
- Path parameters в HTTP API

**🛠️ Реализация:**

- Создать `lambdas/get-document/handler.ts`
- Читает `documentId` из path params
- Делает `GetItem` в DynamoDB
- Возвращает JSON с актуальным статусом
- Добавить роут `GET /api/documents/{documentId}` в API Gateway
- `table.grantReadData(fn)`

---

### Этап 13. Lambda `list-documents-handler` — cursor pagination

**📚 Темы для изучения:**

- DynamoDB `Query` operation
- Cursor pagination vs Offset pagination (почему cursor лучше)
- DynamoDB `LastEvaluatedKey` / `ExclusiveStartKey`
- Base64 encoding для cursor
- Query parameters в HTTP API
- Лимиты на `Query` (1 MB на ответ)

**🛠️ Реализация:**

- Создать `lambdas/list-documents/handler.ts`
- Принимает `userEmail`, `limit`, `cursor` (base64 encoded)
- Делает `Query` с `PK=USER#email`
- Возвращает `items`, `nextCursor`, `hasMore`
- Добавить роут `GET /api/documents`

---

### Этап 14. Lambda `download-result-handler` — pre-signed URL для скачивания

**📚 Темы для изучения:**

- Pre-signed GET URLs
- HTTP 302 Redirect response
- Query params validation

**🛠️ Реализация:**

- Создать `lambdas/download-result/handler.ts`
- Принимает `documentId`, `type=text|thumbnail|metadata`
- Читает из DynamoDB путь к S3 объекту
- Генерирует pre-signed GET URL
- Возвращает 302 Redirect (или JSON с URL)
- Роут `GET /api/documents/{id}/download`

---

## Фаза 3. Event-Driven Pipeline (S3 → SQS → Lambda)

### Этап 15. SQS очередь + Dead Letter Queue

**📚 Темы для изучения:**

- SQS: Standard vs FIFO queues
- Visibility timeout — что это и как считать
- Long polling vs Short polling
- Dead Letter Queue (DLQ) и `maxReceiveCount`
- Redrive policy
- Message retention period

**🛠️ Реализация:**

- Создать `MessagingStack`
- Добавить `processing-dlq` (retention 14 дней)
- Добавить `processing-queue` с redrive policy → DLQ после 3 попыток
- Visibility timeout = 15 минут (равно max Lambda timeout)
- CloudWatch alarm на `ApproximateNumberOfMessagesVisible` в DLQ

---

### Этап 16. S3 Event Notifications → SQS

**📚 Темы для изучения:**

- S3 Event types: `s3:ObjectCreated:*`, `s3:ObjectRemoved:*`
- Event filtering по prefix/suffix
- S3 notification targets: Lambda / SQS / SNS / EventBridge
- CDK `bucket.addEventNotification(...)`

**🛠️ Реализация:**

- В `StorageStack` добавить S3 → SQS notification
- Фильтр: prefix `uploads/`, event `s3:ObjectCreated:Put`
- Target: `processing-queue`
- Загрузить тестовый файл через pre-signed URL и проверить что сообщение появилось в SQS

---

### Этап 17. Lambda `s3-event-orchestrator` — consumer SQS

**📚 Темы для изучения:**

- Lambda Event Source Mapping
- SQS Lambda integration (batch size, parallelization factor)
- Partial batch failures (`batchItemFailures`)
- AWS SDK v3 для Step Functions (`@aws-sdk/client-sfn`)
- Парсинг S3 Event JSON structure

**🛠️ Реализация:**

- Создать `lambdas/s3-event-orchestrator/handler.ts`
- Принимает SQS event (batch до 10 сообщений)
- Для каждого сообщения парсит S3 event
- Извлекает `bucket`, `key`, `size`, достаёт `documentId` из metadata
- Стартует Step Functions execution через `StartExecutionCommand`
- Возвращает partial batch failures для retry
- В CDK: `queue.addEventSource(new SqsEventSource(fn))`

---

## Фаза 4. Step Functions — оркестрация

### Этап 18. Базовая Step Functions State Machine (skeleton)

**📚 Темы для изучения:**

- Step Functions: Standard vs Express workflows
- ASL (Amazon States Language)
- State types: Task, Choice, Parallel, Pass, Wait, Succeed, Fail
- CDK `aws-cdk-lib/aws-stepfunctions` constructs
- Execution history и pricing

**🛠️ Реализация:**

- Создать `WorkflowStack`
- Создать `StateMachine` типа Standard
- Skeleton: `StartAt: Pass1 → Pass2 → End` (просто для проверки)
- Вывести ARN в `CfnOutput`
- Дать `s3-event-orchestrator` permission на `StartExecution`
- Запустить execution вручную через AWS Console

---

### Этап 19. Lambda `validate-document` — Task state

**📚 Темы для изучения:**

- Allowed file types validation
- Magic bytes vs MIME type (что надёжнее)
- S3 `HeadObject` (получить метаданные без скачивания)
- Step Functions `LambdaInvoke` task
- Input/Output processing (`InputPath`, `ResultPath`, `OutputPath`)

**🛠️ Реализация:**

- Создать `lambdas/validate-document/handler.ts`
- Принимает `{bucket, key, documentId}` от Step Functions
- HeadObject в S3 → получает Content-Type и Size
- Валидирует разрешённые типы (pdf, docx, png, jpg)
- Возвращает `{valid: true, fileSize, mimeType}` или throw error
- Заменить первый Pass state на `LambdaInvoke(validateFn)`

---

### Этап 20. Choice state — routing по размеру файла

**📚 Темы для изучения:**

- Step Functions Choice state syntax
- Comparison operators (`NumericLessThan`, `StringEquals`)
- Default branch
- ASL JSONPath expressions

**🛠️ Реализация:**

- Добавить Choice state после Validate
- 3 ветки:
  - `fileSize < 50 MB` → ProcessWithLambda
  - `fileSize < 500 MB` → ProcessWithFargate (пока заглушка Pass)
  - default → ProcessWithBatch (пока заглушка Pass)
- Все ветки сходятся в Pass state `Done`

---

### Этап 21. Lambda `process-with-lambda` — small files (<50MB)

**📚 Темы для изучения:**

- Lambda ephemeral storage (`/tmp`) — до 10 GB
- Streaming download из S3 vs полная загрузка
- Lambda memory configuration (CPU пропорционален RAM)
- Lambda timeout (max 15 минут)

**🛠️ Реализация:**

- Создать `lambdas/process-with-lambda/handler.ts`
- Скачивает файл из S3 в `/tmp/`
- Делает заглушку обработки (просто читает файл и возвращает фейковый результат)
- Реальная логика обработки появится в следующих этапах
- Memory: 1024 MB, Timeout: 5 минут

---

### Этап 22. Lambda `extract-metadata`

**📚 Темы для изучения:**

- Библиотека `pdf-parse` для PDF
- Библиотека `mammoth` для DOCX
- Lambda Layers (для тяжёлых зависимостей)
- Bundling больших npm пакетов через esbuild

**🛠️ Реализация:**

- Создать `lambdas/extract-metadata/handler.ts`
- Для PDF: `pdf-parse` → pages, текст, info
- Для DOCX: `mammoth` → текст
- Возвращает `{pages, wordCount, language, textPreview}`
- Сохраняет полный текст в S3 results bucket: `results/{docId}/text.txt`

---

### Этап 23. Lambda `generate-thumbnail`

**📚 Темы для изучения:**

- Sharp.js для image processing
- pdf-to-png-converter / pdf2pic для рендера первой страницы PDF
- Sharp bundling в Lambda (нужны нативные бинарники под Linux x64/arm64)
- Lambda architecture: x86_64 vs arm64 (Graviton дешевле на 20%)

**🛠️ Реализация:**

- Создать `lambdas/generate-thumbnail/handler.ts`
- Скачивает файл
- Если PDF — рендерит первую страницу в PNG
- Если image — просто ресайз
- Сохраняет `results/{docId}/thumb.png` в S3
- Lambda architecture = arm64

---

### Этап 24. Parallel state — параллельное выполнение extract + thumbnail

**📚 Темы для изучения:**

- Step Functions Parallel state
- Branches и их независимость
- ResultPath при параллельном выполнении (массив результатов)
- Catch на уровне Parallel vs внутри branches

**🛠️ Реализация:**

- После ProcessWithX добавить Parallel state
- Branch 1: ExtractMetadata
- Branch 2: GenerateThumbnail
- Результат: массив `[metadataResult, thumbnailResult]`
- Передать дальше в SaveResults

---

### Этап 25. Lambda `save-results` — финальное сохранение в DynamoDB

**📚 Темы для изучения:**

- DynamoDB `UpdateItem` operation
- UpdateExpressions, ConditionExpressions
- ConsistentRead vs eventually consistent
- DynamoDB transactions (если нужны)

**🛠️ Реализация:**

- Создать `lambdas/save-results/handler.ts`
- Принимает массив результатов от Parallel state
- Делает `UpdateItem`: status=`completed`, results={...}, completedAt=now
- Возвращает финальный объект документа
- Добавить как последний Task в State Machine

---

## Фаза 5. Notifications

### Этап 26. SNS topic для completed/failed

**📚 Темы для изучения:**

- SNS: Topics vs Subscriptions
- Subscription protocols (email, SMS, Lambda, SQS, HTTP)
- Message filtering policies
- Fan-out pattern (SNS → multiple SQS)
- SNS vs EventBridge (когда что выбрать)

**🛠️ Реализация:**

- В `MessagingStack` добавить топик `document-events-topic`
- Один топик с message attributes `eventType=completed|failed`
- Подписка с filter policy будет на следующем этапе

---

### Этап 27. Lambda `send-notification` — публикация в SNS

**📚 Темы для изучения:**

- `@aws-sdk/client-sns` PublishCommand
- Message attributes для filtering
- Email templates

**🛠️ Реализация:**

- Создать `lambdas/send-notification/handler.ts`
- Принимает результат от save-results
- Публикует в SNS с message attribute `eventType=completed`
- Subject + красивый body
- Добавить как финальный Task в State Machine

---

### Этап 28. Email subscription на SNS

**📚 Темы для изучения:**

- Subscription confirmation flow
- SES (Simple Email Service) vs SNS email
- Bounce handling

**🛠️ Реализация:**

- Через AWS Console подписать свой email на топик (или через CDK `EmailSubscription`)
- Filter policy: `eventType: ["completed"]`
- Подтвердить подписку через email
- Запустить тестовую загрузку → проверить что письмо пришло

---

## Фаза 6. ECS Fargate — обработка medium файлов (50-500MB)

### Этап 29. Docker image для обработки документов

**📚 Темы для изучения:**

- Dockerfile основы
- Multi-stage builds для уменьшения размера
- Node.js Docker best practices (alpine vs slim)
- Docker layer caching
- ENTRYPOINT vs CMD

**🛠️ Реализация:**

- В `ecs-worker/` создать Dockerfile
- Base image: `node:20-alpine`
- Multi-stage: build → runtime
- Точка входа: скрипт который читает env vars `BUCKET`, `KEY`, `DOCUMENT_ID`
- Скачивает файл, обрабатывает, загружает результат, обновляет DynamoDB
- Локально протестировать: `docker build && docker run`

---

### Этап 30. ECR repository + push image

**📚 Темы для изучения:**

- ECR (Elastic Container Registry) basics
- ECR repository policies
- CDK `DockerImageAsset` — автоматический build + push
- ECR image scanning (security)
- Image tagging strategies

**🛠️ Реализация:**

- В CDK использовать `DockerImageAsset` указывая на `ecs-worker/`
- При `cdk deploy` автоматически билдится Docker image и пушится в ECR
- Проверить в AWS Console что image появился

---

### Этап 31. ECS Cluster + Task Definition (Fargate)

**📚 Темы для изучения:**

- ECS Cluster vs Service vs Task
- Fargate vs EC2 launch type (Fargate = serverless containers)
- Task Definition: CPU, memory, network mode
- awsvpc network mode (обязателен для Fargate)
- Task IAM Role vs Execution Role
- Fargate pricing (per second)

**🛠️ Реализация:**

- Создать `EcsStack`
- ECS Cluster (без EC2 instances, только Fargate)
- Task Definition: 2 vCPU, 4 GB RAM, image из ECR
- Task Role: read из raw bucket, write в results bucket, DynamoDB read/write
- Container env vars передаются через Step Functions overrides

---

### Этап 32. Step Functions integration с ECS `runTask.sync`

**📚 Темы для изучения:**

- Step Functions service integrations
- `runTask` vs `runTask.sync` vs `runTask.waitForTaskToken`
- Callback pattern (waitForTaskToken)
- ECS task overrides из Step Functions
- Сеть для Fargate: subnets, security groups

**🛠️ Реализация:**

- В State Machine заменить ProcessWithFargate Pass на `EcsRunTask` (`.sync` mode)
- Передать overrides с env vars: BUCKET, KEY, DOCUMENT_ID
- VPC: использовать default VPC или создать новый с public subnets
- Тестовая загрузка файла 100MB → проверить что Fargate task запускается

---

## Фаза 7. AWS Batch — bulk processing (>500MB или массово)

### Этап 33. AWS Batch Compute Environment (Fargate Spot)

**📚 Темы для изучения:**

- AWS Batch концепции: Compute Environment / Job Queue / Job Definition
- Fargate vs EC2 в AWS Batch
- Fargate Spot — что это, скидка до 70%, риск прерывания
- Compute Environment scaling

**🛠️ Реализация:**

- Создать `BatchStack`
- Compute Environment типа `FARGATE_SPOT`
- maxvCpus = 16 (для pet-project достаточно)
- Привязать к default VPC subnets

---

### Этап 34. AWS Batch Job Queue

**📚 Темы для изучения:**

- Job Queue приоритеты
- Multiple Compute Environments per Queue (fallback)
- Job state lifecycle: SUBMITTED → PENDING → RUNNABLE → STARTING → RUNNING → SUCCEEDED/FAILED

**🛠️ Реализация:**

- Создать Job Queue `document-processing-queue`
- Привязать к Compute Environment (FARGATE_SPOT)
- Priority = 1

---

### Этап 35. AWS Batch Job Definition

**📚 Темы для изучения:**

- Job Definition: container image, command, env vars
- Resource requirements (vCPU, memory)
- Retry strategies
- Array Jobs (для bulk processing)
- Job dependencies

**🛠️ Реализация:**

- Использовать тот же `batch-worker/` Dockerfile (или отдельный)
- Job Definition: 4 vCPU, 16 GB RAM
- Retry attempts = 2
- В CDK через `CfnJobDefinition`

---

### Этап 36. Step Functions integration с Batch `submitJob.sync`

**📚 Темы для изучения:**

- Step Functions `BatchSubmitJob` task
- `.sync` mode (ждать завершения)
- Container overrides

**🛠️ Реализация:**

- В State Machine заменить ProcessWithBatch Pass на `BatchSubmitJob` (`.sync`)
- Передать overrides с env vars
- Тестовая загрузка файла 600MB → проверить запуск Batch job

---

## Фаза 8. Saga Pattern + Error Handling

### Этап 37. Step Functions Retry policies

**📚 Темы для изучения:**

- Retry в Step Functions: `ErrorEquals`, `IntervalSeconds`, `MaxAttempts`, `BackoffRate`
- Exponential backoff
- Jitter (опционально)
- States.ALL vs специфичные errors
- Когда retry не помогает (validation errors)

**🛠️ Реализация:**

- На каждый Task state добавить Retry:
  - Lambda task: 3 attempts, backoffRate 2.0, на `Lambda.ServiceException`
  - НЕ retry на `ValidationError`
- Проверить через тестовую ошибку

---

### Этап 38. Catch states + compensating actions (cleanup)

**📚 Темы для изучения:**

- Saga Pattern: orchestration vs choreography
- Compensating transactions
- Catch state syntax в Step Functions
- ResultPath для сохранения error info

**🛠️ Реализация:**

- На каждом Task добавить Catch → CleanupAndFail state
- Catch ловит `States.ALL`
- ResultPath сохраняет error в `$.error`
- Переходит к `CleanupAndFail` (Lambda — следующий этап)

---

### Этап 39. Lambda `cleanup-failed-document` — Saga compensation

**📚 Темы для изучения:**

- Компенсационные действия: удалить раздельно загруженное
- DynamoDB `UpdateItem` с status=`failed`
- S3 `DeleteObject`
- Идемпотентность compensation (можно вызывать несколько раз)

**🛠️ Реализация:**

- Создать `lambdas/cleanup-failed-document/handler.ts`
- Принимает `{documentId, error, bucket?, key?}`
- Удаляет файл из results bucket (если был создан)
- Обновляет DynamoDB: status=`failed`, error=stored
- Публикует failed event в SNS
- В State Machine: `CleanupAndFail → Fail` (терминальное состояние)

---

### Этап 40. Idempotency keys в Lambda handlers

**📚 Темы для изучения:**

- Idempotency: почему критична для retry
- Conditional writes в DynamoDB (`ConditionExpression`)
- Idempotency tokens
- Библиотека `@aws-lambda-powertools/idempotency`

**🛠️ Реализация:**

- Установить `@aws-lambda-powertools/idempotency`
- Создать отдельную DynamoDB таблицу `idempotency-store`
- Обернуть `save-results` и `send-notification` handlers
- Idempotency key = `documentId`

---

## Фаза 9. Bulk Upload (AWS Batch Array Jobs)

### Этап 41. Lambda `bulk-upload-handler` — создание batch записей

**📚 Темы для изучения:**

- DynamoDB `BatchWriteItem` (до 25 items)
- Параллельное создание pre-signed URLs

**🛠️ Реализация:**

- Создать `lambdas/bulk-upload/handler.ts`
- Принимает массив документов
- Генерирует `batchId` + по `documentId` на каждый
- Создаёт записи в DynamoDB одним BatchWrite
- Возвращает массив pre-signed URLs
- Роут `POST /api/documents/bulk-upload`

---

### Этап 42. AWS Batch Array Job — параллельная обработка

**📚 Темы для изучения:**

- Array Jobs: один job → N параллельных tasks
- `AWS_BATCH_JOB_ARRAY_INDEX` env var
- Зависимости между array jobs

**🛠️ Реализация:**

- Создать отдельный trigger (EventBridge rule или Lambda) который после bulk upload запускает Batch Array Job
- Worker контейнер использует `AWS_BATCH_JOB_ARRAY_INDEX` чтобы выбрать свой документ из batch
- Каждый array task обрабатывает один документ

---

### Этап 43. Aggregator Lambda — статус всего batch

**📚 Темы для изучения:**

- DynamoDB Query по `BATCH#id` SK pattern
- Атомарный счётчик через `UpdateItem ADD`

**🛠️ Реализация:**

- Создать `lambdas/check-batch-status/handler.ts`
- Эндпоинт `GET /api/batches/{batchId}`
- Query всех документов в batch → подсчёт completed/failed/pending
- Возвращает агрегированный статус

---

## Фаза 10. Observability

### Этап 44. CloudWatch Logs для всех Lambda и ECS

**📚 Темы для изучения:**

- CloudWatch Log Groups
- Retention policies (логи стоят денег)
- Log Insights queries
- Subscription filters (стрим в Kinesis / OpenSearch)

**🛠️ Реализация:**

- В CDK на каждую Lambda задать `logRetention: RetentionDays.ONE_WEEK`
- На ECS Task Definition подключить `awslogs` driver
- Открыть Log Group в Console и проверить логи

---

### Этап 45. CloudWatch Metrics + custom metrics

**📚 Темы для изучения:**

- Lambda automatic metrics: Invocations, Errors, Duration, Throttles
- Custom metrics через EMF (Embedded Metric Format)
- `@aws-lambda-powertools/metrics`
- Metric namespaces и dimensions

**🛠️ Реализация:**

- Установить `@aws-lambda-powertools/metrics`
- В save-results публиковать metric `DocumentsProcessed` с dimension `ProcessorType=lambda|fargate|batch`
- Создать CloudWatch Dashboard с графиками

---

### Этап 46. CloudWatch Alarms

**📚 Темы для изучения:**

- Alarm states: OK / ALARM / INSUFFICIENT_DATA
- Threshold vs Anomaly detection
- SNS как target для alarm
- Composite alarms

**🛠️ Реализация:**

- Alarm 1: DLQ messages > 0 → SNS notification
- Alarm 2: Lambda error rate > 5% → SNS
- Alarm 3: Step Functions execution failed → SNS

---

### Этап 47. AWS X-Ray distributed tracing

**📚 Темы для изучения:**

- Distributed tracing концепции (trace, segment, subsegment)
- X-Ray daemon vs SDK
- Service map visualization
- AWS SDK auto-instrumentation
- `@aws-lambda-powertools/tracer`

**🛠️ Реализация:**

- В CDK на Lambda задать `tracing: Tracing.ACTIVE`
- Установить powertools tracer
- Запустить пайплайн → открыть X-Ray Service Map в Console

---

### Этап 48. Structured logging (JSON)

**📚 Темы для изучения:**

- Зачем JSON логи (parseable, queryable)
- Correlation IDs (трассировка запроса через все сервисы)
- `@aws-lambda-powertools/logger`
- Log levels и фильтрация

**🛠️ Реализация:**

- Заменить `console.log` на powertools logger во всех handlers
- Передавать correlation ID через всю цепочку (от API Gateway до save-results)
- В Log Insights попробовать query: `fields @timestamp, documentId, status | filter status = "failed"`

---

## Фаза 11. Cost Optimization

### Этап 49. Lambda memory tuning

**📚 Темы для изучения:**

- Lambda billing: GB-seconds
- CPU пропорционален RAM (1769 MB ≈ 1 vCPU)
- AWS Lambda Power Tuning tool
- Cold start влияние RAM

**🛠️ Реализация:**

- Использовать [AWS Lambda Power Tuning](https://github.com/alexcasalboni/aws-lambda-power-tuning)
- Запустить для `process-with-lambda` и `extract-metadata`
- Найти оптимум cost vs speed
- Обновить memory в CDK

---

### Этап 50. Lambda Provisioned Concurrency (опционально)

**📚 Темы для изучения:**

- Cold start vs warm start
- Provisioned Concurrency: pre-warmed instances
- Стоимость vs latency trade-off
- Application Auto Scaling для PC

**🛠️ Реализация:**

- Для `upload-url-handler` (latency-critical) добавить 2 PC
- Стоимость измерить через Cost Explorer

---

### Этап 51. S3 Lifecycle policies

**📚 Темы для изучения:**

- S3 storage classes: Standard / IA / Glacier / Deep Archive
- Lifecycle transitions
- Lifecycle expiration
- Intelligent-Tiering

**🛠️ Реализация:**

- Raw bucket: удалять файлы старше 7 дней (после обработки они не нужны)
- Results bucket: Standard → IA через 30 дней → Glacier через 90 дней
- Логи: удалять через 30 дней

---

### Этап 52. Fargate Spot для Batch

**📚 Темы для изучения:**

- Spot vs On-Demand pricing
- Spot interruptions handling
- Когда Spot НЕ подходит (real-time, stateful)

**🛠️ Реализация:**

- Подтвердить что Batch использует `FARGATE_SPOT`
- В worker коде обработать SIGTERM (graceful shutdown при interruption)
- Retry в Batch Job Definition обработает прерванные jobs

---

## Фаза 12. Тестирование

### Этап 53. Unit-тесты для Lambda handlers

**📚 Темы для изучения:**

- Jest или Vitest
- Mocking AWS SDK v3 (`aws-sdk-client-mock`)
- Тестирование handler как чистой функции
- Coverage reports

**🛠️ Реализация:**

- Установить Jest + `aws-sdk-client-mock`
- Написать тесты для `upload-url-handler` (mock S3, DynamoDB)
- Тесты для `validate-document` (валидные/невалидные форматы)
- Запустить `npm test`

---

### Этап 54. Integration tests (LocalStack или AWS SDK Mock)

**📚 Темы для изучения:**

- LocalStack — локальный AWS эмулятор
- Docker Compose для LocalStack
- Альтернатива: тесты против реального dev AWS аккаунта
- Test isolation (отдельные таблицы/buckets с UUID в имени)

**🛠️ Реализация:**

- Установить LocalStack через Docker Compose
- Написать тест: pre-signed URL → upload → S3 event → SQS → Lambda
- Альтернатива: `cdk deploy` в dev stack + интеграционные тесты против реального AWS

---

### Этап 55. End-to-end ручной тест через Postman

**📚 Темы для изучения:**

- Postman collections и variables
- Postman tests (Chai assertions)
- Environment variables в Postman

**🛠️ Реализация:**

- Создать Postman collection со всеми эндпоинтами
- Сценарий: get upload URL → PUT в S3 → polling GET status → download result
- Экспортировать collection в репозиторий

---

### Этап 56. Load test (Artillery / k6)

**📚 Темы для изучения:**

- Load test vs Stress test vs Soak test
- Artillery scenarios
- k6 (альтернатива на JS)
- Lambda concurrency limits (1000 по умолчанию)

**🛠️ Реализация:**

- Установить Artillery
- Создать сценарий: 100 RPS на upload-url endpoint в течение 5 минут
- Запустить и посмотреть CloudWatch metrics
- Идентифицировать bottleneck (DynamoDB throttling? Lambda concurrency?)

---

## Фаза 13. Документация и финал

### Этап 57. README с архитектурной диаграммой

**📚 Темы для изучения:**

- Markdown best practices
- Diagrams as code: Mermaid, draw.io, AWS Diagram tools
- README структура: Quick Start, Architecture, Deployment, Testing

**🛠️ Реализация:**

- Написать `README.md` с разделами:
  - Описание проекта
  - Архитектурная диаграмма (Mermaid)
  - Prerequisites
  - Deployment instructions
  - API examples (curl)
  - Cost estimate
- Добавить badges (build status, license)

---

### Этап 58. ADR (Architecture Decision Records)

**📚 Темы для изучения:**

- ADR формат (Michael Nygard template)
- Когда писать ADR
- Связь ADR ↔ commit history

**🛠️ Реализация:**

- Создать `docs/adr/` папку
- ADR 001: Почему CDK, а не Terraform
- ADR 002: Почему Single Table Design в DynamoDB
- ADR 003: Почему Step Functions Standard, а не Express
- ADR 004: Почему разделение Lambda/Fargate/Batch по размеру файла

---

### Этап 59. Финальная проверка и cleanup ресурсов

**📚 Темы для изучения:**

- AWS Cost Explorer
- AWS Budgets
- `cdk destroy` (что удалится, что останется)
- Stateful ресурсы: S3 buckets, DynamoDB tables (защита от удаления)

**🛠️ Реализация:**

- Чек-лист по всем фазам — что работает
- Проверить AWS Cost Explorer — сколько потратили
- Если не нужно — `cdk destroy --all`
- ВНИМАНИЕ: S3 buckets с данными нужно сначала очистить
- Создать финальный коммит + tag `v1.0.0`

---

## 🎯 Финальный чек-лист готовности

- [ ] Все 59 этапов реализованы
- [ ] Все Lambda имеют unit-тесты
- [ ] Step Functions проходит для small/medium/large файлов
- [ ] Bulk upload работает на 100+ документах
- [ ] CloudWatch Dashboard настроен
- [ ] Альармы срабатывают
- [ ] Cost Explorer показывает < $5/месяц при тестовой нагрузке
- [ ] README + ADR опубликованы на GitHub
- [ ] Готовы устные ответы на собеседовании про каждый AWS сервис

---

**Следующий шаг:** скажи, и я сделаю детальный walkthrough для **Этапа 1** с конкретными командами установки и проверки.
