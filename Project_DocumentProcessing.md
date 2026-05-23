# 📄 Document Processing Platform — Pure Serverless Project

> **Тип:** Pet-project для изучения AWS Serverless за 1 неделю
> **Стек:** Pure Serverless (Node.js + TypeScript, без NestJS)
> **Цель:** Освоить Lambda + Step Functions + S3 + ECS + AWS Batch + SQS на реальном бизнес-кейсе

---

## 📑 Содержание

1. [🎯 Цель проекта](#1--цель-проекта)
2. [💼 Бизнес-ценность (Business Value)](#2--бизнес-ценность-business-value)
   - 2.1. [Реальные use cases такой платформы](#21-реальные-use-cases-такой-платформы)
   - 2.2. [Что решает проект](#22-что-решает-проект)
   - 2.3. [Бизнес-метрики, которые улучшает](#23-бизнес-метрики-которые-улучшает)
3. [🏗️ Архитектура высокого уровня](#3-️-архитектура-высокого-уровня)
4. [🛠️ Используемые AWS технологии](#4-️-используемые-aws-технологии)
   - 4.1. [Core Compute (главное для изучения!)](#41-core-compute-главное-для-изучения)
   - 4.2. [Storage & Data](#42-storage--data)
   - 4.3. [Messaging & Events](#43-messaging--events)
   - 4.4. [API & Auth](#44-api--auth)
   - 4.5. [Infrastructure & DevOps](#45-infrastructure--devops)
   - 4.6. [Архитектурные паттерны](#46-архитектурные-паттерны)
5. [🔌 REST API — детальная спецификация](#5--rest-api--детальная-спецификация)
   - 5.1. [Base URL](#51-base-url)
   - 5.2. [Получить pre-signed URL для upload](#52-получить-pre-signed-url-для-upload)
   - 5.3. [Upload файла (напрямую в S3)](#53-upload-файла-напрямую-в-s3)
   - 5.4. [Получить статус документа](#54-получить-статус-документа)
   - 5.5. [Скачать результат](#55-скачать-результат)
   - 5.6. [Список документов пользователя](#56-список-документов-пользователя)
   - 5.7. [Bulk upload (опционально)](#57-bulk-upload-опционально)
6. [🔍 Как именно используются AWS сервисы — детально](#6--как-именно-используются-aws-сервисы--детально)
   - 6.1. [Lambda Functions (5-6 штук)](#61-lambda-functions-5-6-штук)
   - 6.2. [Step Functions State Machine](#62-step-functions-state-machine)
   - 6.3. [ECS Fargate Task](#63-ecs-fargate-task)
   - 6.4. [AWS Batch](#64-aws-batch)
   - 6.5. [S3 структура](#65-s3-структура)
   - 6.6. [DynamoDB схема (Single Table Design)](#66-dynamodb-схема-single-table-design)
   - 6.7. [SQS очереди](#67-sqs-очереди)
   - 6.8. [SNS темы](#68-sns-темы)
7. [🎓 Что ты освоишь после проекта](#7--что-ты-освоишь-после-проекта)
   - 7.1. [Hard Skills](#71-hard-skills)
   - 7.2. [Концепции](#72-концепции)
   - 7.3. [Готовые ответы на собеседовании](#73-готовые-ответы-на-собеседовании)
8. [🚀 Следующий шаг](#8--следующий-шаг)

---

## 1. 🎯 Цель проекта

Построить **production-ready сервис обработки документов**, который принимает PDF/Word/изображения от пользователей, обрабатывает их через разные AWS compute сервисы в зависимости от размера, и выдаёт готовый результат: извлечённый текст, OCR, превью, метаданные.

**Главная задача:** на одном проекте увидеть **разницу** между Lambda, ECS Fargate и AWS Batch — когда что использовать и почему.

---

## 2. 💼 Бизнес-ценность (Business Value)

### 2.1. Реальные use cases такой платформы

1. **Юридические компании** — обработка контрактов, поиск по содержимому
2. **HR платформы** — парсинг резюме (LinkedIn-style)
3. **Банки/Финтех** — обработка KYC документов, паспортов, выписок
4. **Медицина** — оцифровка медкарт, рецептов
5. **Логистика** — обработка накладных, инвойсов

### 2.2. Что решает проект

- ❌ **Проблема:** Бизнес-пользователи загружают документы разного размера (1 MB — 5 GB). Один монолит не справится: либо упадёт на больших файлах, либо будет дорого держать ресурсы для маленьких.
- ✅ **Решение:** Smart routing — каждый размер обрабатывается оптимальным AWS сервисом.

### 2.3. Бизнес-метрики, которые улучшает

- ⏱️ **Скорость обработки:** 90% документов готовы за < 10 секунд (Lambda)
- 💰 **Cost optimization:** платим только за время обработки (serverless)
- 📈 **Scalability:** автоматически масштабируется от 1 до 100,000 документов в день
- 🔄 **Reliability:** Step Functions + DLQ гарантируют, что ни один документ не потеряется

---

## 3. 🏗️ Архитектура высокого уровня

```
┌─────────────┐
│   Client    │ (Postman / curl / любой HTTP клиент)
└──────┬──────┘
       │ 1. POST /api/documents/upload-url
       ↓
┌──────────────────┐
│  API Gateway     │
└──────┬───────────┘
       ↓
┌──────────────────┐
│  Lambda          │ ← генерирует pre-signed URL
│  (upload-url)    │
└──────┬───────────┘
       │ 2. Возвращает URL
       ↓
┌─────────────┐
│   Client    │ ← загружает файл напрямую в S3
└──────┬──────┘
       │ 3. PUT файл в S3
       ↓
┌──────────────────┐
│       S3         │ ← Event Notification
│  (raw-bucket)    │
└──────┬───────────┘
       │ 4. S3 Event → SQS message
       ↓
┌──────────────────┐
│      SQS         │ ← очередь обработки + DLQ
└──────┬───────────┘
       │ 5. Lambda trigger
       ↓
┌──────────────────┐
│  Lambda          │ ← запускает Step Functions
│  (orchestrator)  │
└──────┬───────────┘
       │ 6. StartExecution
       ↓
┌─────────────────────────────────────────────┐
│         AWS Step Functions Workflow         │
│                                             │
│  ┌──────────────┐                           │
│  │  Validate    │ ← Lambda                  │
│  └──────┬───────┘                           │
│         ↓                                   │
│  ┌──────────────┐                           │
│  │ Choice State │ ← по размеру файла        │
│  └──────┬───────┘                           │
│         │                                   │
│  ┌──────┴──────────┬──────────────┐        │
│  ↓                 ↓              ↓         │
│ <50MB            <500MB          >500MB     │
│ Lambda          ECS Fargate     AWS Batch   │
│  │                 │              │         │
│  └────────┬────────┴──────────────┘        │
│           ↓                                 │
│  ┌──────────────┐                           │
│  │   Parallel   │                           │
│  │  - thumbnail │ ← Lambda                  │
│  │  - metadata  │ ← Lambda                  │
│  └──────┬───────┘                           │
│         ↓                                   │
│  ┌──────────────┐                           │
│  │   Save to    │ ← Lambda                  │
│  │  DynamoDB    │                           │
│  └──────┬───────┘                           │
│         ↓                                   │
│  ┌──────────────┐                           │
│  │   Notify     │ ← SNS → email             │
│  │   via SNS    │                           │
│  └──────────────┘                           │
└─────────────────────────────────────────────┘
       │ 7. Результат сохранён
       ↓
┌─────────────┐
│   Client    │ ← GET /api/documents/:id для статуса
└─────────────┘
```

---

## 4. 🛠️ Используемые AWS технологии

### 4.1. Core Compute (главное для изучения!)

| Сервис             | Где используется                                            | Почему именно он                           |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------ |
| **AWS Lambda**     | Validate, thumbnails, metadata, notifications, orchestrator | Быстрые задачи < 15 минут, pay-per-request |
| **ECS Fargate**    | Обработка файлов 50-500 MB                                  | Файлы > 15 минут или > 10 GB памяти        |
| **AWS Batch**      | Файлы > 500 MB, bulk processing                             | Очень тяжёлые задачи, parallel jobs        |
| **Step Functions** | Orchestration всего workflow                                | Visual workflow + Saga pattern + retry     |

### 4.2. Storage & Data

| Сервис       | Где используется                                     |
| ------------ | ---------------------------------------------------- |
| **S3**       | Raw документы + обработанные результаты + thumbnails |
| **DynamoDB** | Metadata + status документов + результаты            |

### 4.3. Messaging & Events

| Сервис                     | Где используется                            |
| -------------------------- | ------------------------------------------- |
| **SQS**                    | Buffer между S3 Events и orchestrator + DLQ |
| **SNS**                    | Email/notifications когда документ готов    |
| **S3 Event Notifications** | Триггер на upload в S3                      |

### 4.4. API & Auth

| Сервис          | Где используется                      |
| --------------- | ------------------------------------- |
| **API Gateway** | REST API endpoints                    |
| **IAM**         | Roles & permissions для всех сервисов |

### 4.5. Infrastructure & DevOps

| Сервис                  | Где используется                    |
| ----------------------- | ----------------------------------- |
| **AWS CDK**             | Infrastructure as Code (TypeScript) |
| **ECR**                 | Docker registry для ECS image       |
| **CloudWatch Logs**     | Логи всех Lambda + ECS              |
| **CloudWatch Metrics**  | Мониторинг                          |
| **X-Ray** (опционально) | Distributed tracing                 |

### 4.6. Архитектурные паттерны

- ✅ **Saga Pattern** — через Step Functions Catch + compensating actions
- ✅ **Event-Driven Architecture** — S3 → SQS → Lambda → Step Functions
- ✅ **Pre-signed URL pattern** — клиент грузит напрямую в S3
- ✅ **Producer-Consumer pattern** — SQS как буфер
- ✅ **Circuit Breaker** — через Step Functions Retry policies
- ✅ **Dead Letter Queue** — для failed messages

---

## 5. 🔌 REST API — детальная спецификация

### 5.1. Base URL

`https://{api-id}.execute-api.{region}.amazonaws.com/prod`

---

### 5.2. Получить pre-signed URL для upload

Клиент НЕ грузит файл через API (это дорого и медленно). Вместо этого получает временную URL для прямой загрузки в S3.

**Endpoint:**

```http
POST /api/documents/upload-url
Content-Type: application/json
```

**Request Body:**

```json
{
  "fileName": "contract.pdf",
  "fileSize": 5242880,
  "mimeType": "application/pdf",
  "userEmail": "user@example.com"
}
```

**Response (200 OK):**

```json
{
  "documentId": "doc_abc123xyz",
  "uploadUrl": "https://docprocess-raw-bucket.s3.amazonaws.com/uploads/doc_abc123xyz?X-Amz-Signature=...",
  "expiresIn": 3600,
  "fields": {
    "key": "uploads/doc_abc123xyz",
    "Content-Type": "application/pdf"
  }
}
```

**Что происходит под капотом:**

1. Lambda генерирует уникальный `documentId`
2. Создаёт pre-signed URL для S3 PUT
3. Сохраняет в DynamoDB запись со статусом `pending_upload`
4. Возвращает URL клиенту

---

### 5.3. Upload файла (напрямую в S3)

Клиент использует URL из шага 1.

**Endpoint:**

```http
PUT {uploadUrl}
Content-Type: application/pdf
Body: <binary file data>
```

**Response (200 OK):**

```http
ETag: "abc123..."
```

**Что происходит:**

1. Файл загружается напрямую в S3 (без участия Lambda)
2. S3 Event Notification → SQS message
3. Lambda consumer запускает Step Functions
4. Статус в DynamoDB меняется на `processing`

---

### 5.4. Получить статус документа

**Endpoint:**

```http
GET /api/documents/{documentId}
```

**Response — Pending (202 Accepted):**

```json
{
  "documentId": "doc_abc123xyz",
  "status": "processing",
  "createdAt": "2026-05-20T10:00:00Z",
  "currentStep": "extracting_text",
  "progress": 45
}
```

**Response — Completed (200 OK):**

```json
{
  "documentId": "doc_abc123xyz",
  "status": "completed",
  "fileName": "contract.pdf",
  "fileSize": 5242880,
  "createdAt": "2026-05-20T10:00:00Z",
  "completedAt": "2026-05-20T10:00:15Z",
  "processedBy": "lambda",
  "results": {
    "textContent": "https://docprocess-results.s3.amazonaws.com/.../text.txt",
    "thumbnail": "https://docprocess-results.s3.amazonaws.com/.../thumb.png",
    "metadata": {
      "pages": 12,
      "language": "ru",
      "wordCount": 3450,
      "author": "John Doe",
      "createdDate": "2024-01-15"
    }
  }
}
```

**Response — Failed (200 OK with error):**

```json
{
  "documentId": "doc_abc123xyz",
  "status": "failed",
  "error": {
    "code": "INVALID_FORMAT",
    "message": "Unsupported document format",
    "step": "validate"
  }
}
```

**Возможные статусы:**

- `pending_upload` — ждём загрузки в S3
- `queued` — в SQS очереди
- `processing` — обрабатывается Step Functions
- `completed` — готово
- `failed` — ошибка (compensating Saga отработала)

---

### 5.5. Скачать результат

**Endpoint:**

```http
GET /api/documents/{documentId}/download?type=text
```

**Query params:**

- `type` — `text` | `thumbnail` | `metadata`

**Response (302 Redirect):**

```http
Location: https://docprocess-results.s3.amazonaws.com/.../text.txt?X-Amz-Signature=...
```

Возвращает pre-signed URL для скачивания (валиден 1 час).

---

### 5.6. Список документов пользователя

**Endpoint:**

```http
GET /api/documents?userEmail=user@example.com&limit=20&cursor=eyJpZCI...
```

**Response (200 OK):**

```json
{
  "items": [
    {
      "documentId": "doc_abc123",
      "fileName": "contract.pdf",
      "status": "completed",
      "createdAt": "2026-05-20T10:00:00Z"
    }
  ],
  "nextCursor": "eyJpZCI6ImRvY18xMjMifQ==",
  "hasMore": true
}
```

**Особенность:** используется **cursor pagination** (которую спрашивали на собеседовании!).

---

### 5.7. Bulk upload (опционально)

Для тестирования AWS Batch — загружаем 100+ документов одной операцией.

**Endpoint:**

```http
POST /api/documents/bulk-upload
```

**Request Body:**

```json
{
  "documents": [
    { "fileName": "doc1.pdf", "fileSize": 1024000 },
    { "fileName": "doc2.pdf", "fileSize": 2048000 }
  ],
  "userEmail": "user@example.com"
}
```

**Response (200 OK):**

```json
{
  "batchId": "batch_xyz789",
  "documents": [
    { "documentId": "doc_1", "uploadUrl": "..." },
    { "documentId": "doc_2", "uploadUrl": "..." }
  ],
  "estimatedTime": "5 minutes"
}
```

**Что происходит:**

1. Создаётся batch в DynamoDB
2. Каждый документ получает свой pre-signed URL
3. После загрузки всех → запускается **AWS Batch Array Job**
4. Параллельная обработка всех документов
5. Notification через SNS когда весь batch готов

---

## 6. 🔍 Как именно используются AWS сервисы — детально

### 6.1. Lambda Functions (5-6 штук)

1. **`upload-url-handler`** — генерация pre-signed URL
2. **`get-document-handler`** — статус документа из DynamoDB
3. **`list-documents-handler`** — список с cursor pagination
4. **`s3-event-orchestrator`** — стартует Step Functions
5. **`validate-document`** — проверка формата, размера
6. **`extract-metadata`** — для small файлов
7. **`generate-thumbnail`** — превью документа
8. **`save-results`** — финальное сохранение в DynamoDB
9. **`send-notification`** — публикация в SNS

### 6.2. Step Functions State Machine

```json
{
  "StartAt": "ValidateDocument",
  "States": {
    "ValidateDocument": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:validate-document",
      "Next": "ChooseProcessor",
      "Catch": [{
        "ErrorEquals": ["ValidationError"],
        "Next": "CleanupAndFail"
      }]
    },
    "ChooseProcessor": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.fileSize",
          "NumericLessThan": 52428800,
          "Next": "ProcessWithLambda"
        },
        {
          "Variable": "$.fileSize",
          "NumericLessThan": 524288000,
          "Next": "ProcessWithFargate"
        }
      ],
      "Default": "ProcessWithBatch"
    },
    "ProcessWithLambda": { "Type": "Task", "Resource": "...", "Next": "ParallelExtract" },
    "ProcessWithFargate": { "Type": "Task", "Resource": "arn:aws:states:::ecs:runTask.sync", "Next": "ParallelExtract" },
    "ProcessWithBatch": { "Type": "Task", "Resource": "arn:aws:states:::batch:submitJob.sync", "Next": "ParallelExtract" },
    "ParallelExtract": {
      "Type": "Parallel",
      "Branches": [
        { "StartAt": "ExtractMetadata", "States": {...} },
        { "StartAt": "GenerateThumbnail", "States": {...} }
      ],
      "Next": "SaveResults"
    },
    "SaveResults": { "Type": "Task", "Resource": "...", "Next": "NotifyUser" },
    "NotifyUser": { "Type": "Task", "Resource": "...", "End": true },
    "CleanupAndFail": { "Type": "Task", "Resource": "...", "End": true }
  }
}
```

### 6.3. ECS Fargate Task

- Docker image с Node.js + библиотеки для обработки PDF (`pdf-parse`, `sharp`, `tesseract.js`)
- Запускается через Step Functions `ecs:runTask.sync`
- Скачивает файл из S3 → обрабатывает → загружает результат обратно в S3
- Останавливается после завершения (не Service, а Task)

### 6.4. AWS Batch

- Job Definition с тем же Docker image, но с большими ресурсами (16 vCPU, 32 GB RAM)
- Array Jobs для bulk processing (100+ документов параллельно)
- Compute Environment на Fargate Spot (70% экономия!)

### 6.5. S3 структура

```
docprocess-raw-bucket/
  uploads/
    doc_abc123/
      original.pdf

docprocess-results-bucket/
  results/
    doc_abc123/
      text.txt
      thumb.png
      metadata.json
```

### 6.6. DynamoDB схема (Single Table Design)

```
PK              | SK              | Attributes
----------------|------------------|------------------
USER#user@x.com | DOC#doc_abc123  | status, fileName, results...
USER#user@x.com | BATCH#batch_xyz | totalDocs, completed...
DOC#doc_abc123  | METADATA        | pages, wordCount...
```

### 6.7. SQS очереди

- `document-processing-queue` — main queue
- `document-processing-dlq` — Dead Letter Queue (после 3 failed attempts)
- Visibility timeout: 15 минут
- Long polling включен

### 6.8. SNS темы

- `document-completed-topic` → email subscription
- `document-failed-topic` → admin email

---

## 7. 🎓 Что ты освоишь после проекта

### 7.1. Hard Skills

- ✅ Lambda handlers, layers, IAM permissions
- ✅ S3 pre-signed URLs, Event Notifications
- ✅ SQS + DLQ, Lambda Event Source Mapping
- ✅ Step Functions: Task, Choice, Parallel, Catch, Retry
- ✅ ECS Fargate Task Definitions, ECR
- ✅ AWS Batch Job Definitions, Array Jobs
- ✅ DynamoDB Single Table Design, cursor pagination
- ✅ CDK Infrastructure as Code
- ✅ CloudWatch Logs Insights

### 7.2. Концепции

- ✅ Когда Lambda vs Fargate vs Batch
- ✅ Saga pattern на практике
- ✅ Event-Driven Architecture
- ✅ Idempotency (важно для retry!)
- ✅ Cost optimization (Spot instances, Lambda memory tuning)

### 7.3. Готовые ответы на собеседовании

- "Я выбрал Step Functions вместо chain of Lambdas, потому что..."
- "Для файлов > 15 минут я использовал ECS Fargate, потому что Lambda имеет ограничение..."
- "Saga pattern реализовал через Step Functions Catch states + compensating actions..."
- "Для bulk processing использовал AWS Batch Array Jobs, потому что..."
- "DLQ настроил с 3 retry attempts, чтобы..."

---

## 8. 🚀 Следующий шаг

После прочтения этого описания — скажи, и я создам **детальный пошаговый план на 7 дней** с:

- 📋 Конкретными задачами на каждый день
- 💻 CDK boilerplate кодом для старта
- 🏗️ Архитектурными диаграммами
- ✅ Чек-листами для самопроверки
- 🎤 Тренировочными вопросами для собеседования

Готов начать? 🚀
