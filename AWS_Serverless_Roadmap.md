# ☁️ AWS Serverless Roadmap для Senior Node.js Backend + Tech Lead

> **Цель:** Полное освоение AWS Serverless экосистемы за 3-6 месяцев
> **Уровень:** Senior Backend Node.js → Tech Lead
> **Фокус:** Lambda, её ограничения и альтернативы (ECS, Batch, Fargate)

---

## � Содержание

0. [📊 Рынок (2026)](#0--рынок-2026)
   - 0.1. [Топ AWS навыки по зарплате](#01-топ-aws-навыки-по-зарплате)
1. [🎯 Phase 1: Lambda Foundation (Weeks 1-3)](#1--phase-1-lambda-foundation-weeks-1-3)
   - 1.1. [AWS Lambda — основа serverless](#11-aws-lambda--основа-serverless)
   - 1.2. [Cold Start — главная боль Lambda](#12-cold-start--главная-боль-lambda)
   - 1.3. [API Gateway — HTTP интерфейс для Lambda](#13-api-gateway--http-интерфейс-для-lambda)
2. [🔥 Phase 2: Data & Storage (Weeks 4-6)](#2--phase-2-data--storage-weeks-4-6)
   - 2.1. [DynamoDB — NoSQL для serverless](#21-dynamodb--nosql-для-serverless)
   - 2.2. [S3 — хранилище всего](#22-s3--хранилище-всего)
3. [⚡ Phase 3: Event-Driven Architecture (Weeks 7-9)](#3--phase-3-event-driven-architecture-weeks-7-9)
   - 3.1. [SQS (Simple Queue Service)](#31-sqs-simple-queue-service)
   - 3.2. [SNS (Simple Notification Service)](#32-sns-simple-notification-service)
   - 3.3. [EventBridge — современная замена SNS](#33-eventbridge--современная-замена-sns)
   - 3.4. [Step Functions — оркестрация](#34-step-functions--оркестрация)
4. [🐳 Phase 4: За пределами Lambda — Containers (Weeks 10-12)](#4--phase-4-за-пределами-lambda--containers-weeks-10-12)
   - 4.1. [ECS (Elastic Container Service)](#41-ecs-elastic-container-service)
   - 4.2. [Fargate — serverless containers](#42-fargate--serverless-containers)
   - 4.3. [AWS Batch — для batch processing](#43-aws-batch--для-batch-processing)
   - 4.4. [Bonus: AWS Glue (для Data Engineering)](#44-bonus-aws-glue-для-data-engineering)
5. [🔐 Phase 5: Production Readiness (Weeks 13-15)](#5--phase-5-production-readiness-weeks-13-15)
   - 5.1. [Observability](#51-observability)
   - 5.2. [Security](#52-security)
   - 5.3. [Cost Optimization](#53-cost-optimization)
6. [🏗️ Phase 6: Infrastructure as Code (Weeks 16-18)](#6-️-phase-6-infrastructure-as-code-weeks-16-18)
   - 6.1. [AWS CDK (рекомендую)](#61-aws-cdk-рекомендую)
   - 6.2. [Альтернативы](#62-альтернативы)
7. [🎓 Phase 7: Architecture Patterns (Weeks 19-21)](#7--phase-7-architecture-patterns-weeks-19-21)
   - 7.1. [Архитектурные паттерны](#71-архитектурные-паттерны)
   - 7.2. [Microservices в AWS](#72-microservices-в-aws)
   - 7.3. [Multi-Region & Disaster Recovery](#73-multi-region--disaster-recovery)
8. [📚 Phase 8: Tech Lead Skills (Weeks 22-24)](#8--phase-8-tech-lead-skills-weeks-22-24)
   - 8.1. [Architecture Decision Records (ADR)](#81-architecture-decision-records-adr)
   - 8.2. [Cost & Performance Engineering](#82-cost--performance-engineering)
   - 8.3. [Team Leadership](#83-team-leadership)
9. [🏆 Сертификации (опционально, но плюс к резюме)](#9--сертификации-опционально-но-плюс-к-резюме)
10. [📅 Итоговый план обучения](#10--итоговый-план-обучения)
11. [🎯 Чек-лист готовности к Tech Lead роли](#11--чек-лист-готовности-к-tech-lead-роли)
    - 11.1. [Технический уровень](#111-технический-уровень)
    - 11.2. [Лидерские навыки](#112-лидерские-навыки)
12. [🚀 Следующий шаг](#12--следующий-шаг)

---

## 0. �📊 Рынок (2026)

- **75%** новых backend проектов используют serverless
- **AWS** держит **32%** cloud market share
- **$160K-$240K** медианная зарплата Senior AWS Backend
- **$200K-$320K** Tech Lead с AWS экспертизой
- **+40%** к зарплате за AWS Solutions Architect сертификацию

### 0.1. Топ AWS навыки по зарплате

| Навык                        | Востребованность | Salary Premium |
| ---------------------------- | ---------------- | -------------- |
| Lambda + Step Functions      | 84%              | +$30K          |
| ECS / Fargate                | 71%              | +$35K          |
| Event-Driven Architecture    | 68%              | +$40K          |
| Infrastructure as Code (CDK) | 62%              | +$28K          |
| Cost Optimization            | 54%              | +$45K          |

---

## 1. 🎯 Phase 1: Lambda Foundation (Weeks 1-3)

**💰 Impact: +$20-30K salary boost**

### 1.1. AWS Lambda — основа serverless

**Что освоить:**

- Lambda execution model (cold start vs warm)
- Handler signatures (Node.js)
- Environment variables & Secrets Manager
- IAM Roles & Permissions
- CloudWatch Logs & Metrics
- Lambda Layers (переиспользование кода)
- Lambda Versions & Aliases (blue/green deployment)

**Ограничения Lambda (КРИТИЧНО для tech lead):**

| Ограничение           | Лимит                        | Альтернатива при превышении      |
| --------------------- | ---------------------------- | -------------------------------- |
| Execution time        | 15 минут                     | ECS / AWS Batch / Step Functions |
| Memory                | 10 GB                        | ECS / EC2                        |
| Package size          | 250 MB (unzipped)            | Container image (10 GB)          |
| /tmp storage          | 10 GB                        | EFS mount / S3                   |
| Concurrent executions | 1000 (default)               | Reserved/Provisioned concurrency |
| Payload size          | 6 MB (sync) / 256 KB (async) | S3 pre-signed URLs               |

**Результат:** Понимаешь, когда Lambda — правильный выбор, а когда нет.

---

### 1.2. Cold Start — главная боль Lambda

**Что освоить:**

- Причины cold start (init phase)
- Метрики (Init Duration в CloudWatch)
- Provisioned Concurrency vs On-Demand
- SnapStart (для Java, но концепция важна)
- Lambda Warming (CloudWatch Events)
- Оптимизация bundle size (esbuild, webpack)
- Lazy loading стратегии

**Зарплатный бонус:** +$15K (понимание оптимизаций)

---

### 1.3. API Gateway — HTTP интерфейс для Lambda

**Что освоить:**

- REST API vs HTTP API (когда что)
- Lambda Proxy Integration
- Request/Response transformations
- Authorizers (Cognito, Lambda, JWT)
- Throttling & Usage Plans
- API Keys & WAF integration
- Custom domain & SSL
- CORS configuration

**Tech Lead уровень:**

- Когда выбрать AppSync (GraphQL) вместо API Gateway
- Когда использовать ALB + Lambda вместо API Gateway
- Cost comparison REST vs HTTP API (HTTP в 70% дешевле!)

---

## 2. 🔥 Phase 2: Data & Storage (Weeks 4-6)

**💰 Impact: +$25-35K salary boost**

### 2.1. DynamoDB — NoSQL для serverless

**Что освоить:**

- Partition Key & Sort Key (правильный дизайн!)
- Single Table Design (Rick Houlihan подход)
- GSI (Global Secondary Index) & LSI
- On-Demand vs Provisioned capacity
- DAX (caching layer)
- Streams (для триггеров)
- Transactions
- TTL (auto-delete)

**Tech Lead уровень:**

- Когда DynamoDB, а когда RDS/Aurora
- Cost optimization (read/write patterns)
- Hot partition проблема и решения

**КРИТИЧНО:** Неправильный дизайн схемы = переписывать всё приложение!

---

### 2.2. S3 — хранилище всего

**Что освоить:**

- Storage classes (Standard, IA, Glacier, Intelligent-Tiering)
- Pre-signed URLs (upload/download)
- Event Notifications (S3 → Lambda/SQS/SNS)
- Lifecycle policies
- Versioning & Replication
- Encryption (SSE-S3, SSE-KMS, SSE-C)
- Multipart upload (для больших файлов)
- S3 Select (query без скачивания)

**Tech Lead уровень:**

- Cost optimization (Intelligent-Tiering экономит 40%)
- Cross-region replication strategies
- S3 как статический сайт vs CloudFront

---

## 3. ⚡ Phase 3: Event-Driven Architecture (Weeks 7-9)

**💰 Impact: +$35-50K salary boost** — это сердце serverless!

### 3.1. SQS (Simple Queue Service)

**Что освоить:**

- Standard vs FIFO очереди
- Visibility Timeout
- Dead Letter Queue (DLQ)
- Long polling vs Short polling
- Message attributes
- Batch operations
- Lambda Event Source Mapping

**Use cases:**

- Decoupling сервисов
- Rate limiting downstream
- Retry механизм
- Async processing

---

### 3.2. SNS (Simple Notification Service)

**Что освоить:**

- Topics & Subscriptions
- Fan-out pattern (SNS → multiple SQS)
- Message filtering
- FIFO topics
- Mobile push notifications
- Email/SMS delivery

**Tech Lead уровень:**

- SNS + SQS combo (best practice)
- Когда EventBridge лучше SNS

---

### 3.3. EventBridge — современная замена SNS

**Что освоить:**

- Event Bus (default, custom, partner)
- Event Rules & Patterns
- Schema Registry
- Event Archive & Replay
- Pipes (новая фича для интеграций)
- Scheduler (замена CloudWatch Events)

**Почему EventBridge > SNS для новых проектов:**

- Content-based routing
- 100+ AWS service integrations
- 3rd party SaaS integrations (Stripe, Shopify)
- Event replay для debugging

---

### 3.4. Step Functions — оркестрация

**Что освоить:**

- Standard vs Express workflows
- State types (Task, Choice, Parallel, Map, Wait)
- Error handling (Retry, Catch)
- Callback patterns (waitForTaskToken)
- Saga pattern implementation
- Nested workflows
- Integration с 200+ AWS сервисами

**Use cases:**

- Долгие процессы (до 1 года!)
- Distributed transactions (Saga)
- Human-in-the-loop workflows
- ML pipelines

**Tech Lead уровень:**

- Standard (durable, дороже) vs Express (быстро, дешевле)
- Когда Step Functions vs custom orchestration в коде

---

## 4. 🐳 Phase 4: За пределами Lambda — Containers (Weeks 10-12)

**💰 Impact: +$30-40K salary boost** — где Lambda не справляется

### 4.1. ECS (Elastic Container Service)

**Что освоить:**

- ECS vs EKS (когда что)
- Task Definitions
- Services & Tasks
- Cluster management
- Service Discovery
- Auto Scaling (target tracking, step scaling)
- Load Balancing (ALB integration)
- Rolling deployments vs Blue/Green

**Launch types:**

- **EC2** — полный контроль, дешевле для постоянной нагрузки
- **Fargate** — serverless контейнеры, без управления серверами

---

### 4.2. Fargate — serverless containers

**Что освоить:**

- Когда Fargate > Lambda
- Когда Fargate > EC2
- Spot Fargate (70% экономии)
- Networking (awsvpc mode)
- Secrets management
- CloudWatch integration

**Lambda vs Fargate decision matrix:**

| Критерий         | Lambda      | Fargate           |
| ---------------- | ----------- | ----------------- |
| Время выполнения | < 15 минут  | Без ограничений   |
| Cold start       | 100ms - 5s  | 30-60s (но 1 раз) |
| Стоимость        | Per-request | Per-second        |
| Memory           | до 10 GB    | до 120 GB         |
| Use case         | API, events | Long-running apps |

---

### 4.3. AWS Batch — для batch processing

**Что освоить:**

- Job Definitions
- Job Queues с приоритетами
- Compute Environments (EC2, Fargate, Spot)
- Array Jobs (массовая обработка)
- Multi-node parallel jobs
- Integration со Step Functions

**Use cases (где Lambda НЕ подходит):**

- ETL процессы (часы работы)
- ML model training
- Video/Image processing batches
- Scientific computations
- Massive data migration

---

### 4.4. Bonus: AWS Glue (для Data Engineering)

**Что освоить (опционально, но полезно для Tech Lead):**

- Glue ETL Jobs (Spark под капотом)
- Glue Crawlers
- Data Catalog
- Glue Studio (визуальный ETL)

---

## 5. 🔐 Phase 5: Production Readiness (Weeks 13-15)

**💰 Impact: +$25-35K salary boost** — без этого не Tech Lead

### 5.1. Observability

**Что освоить:**

- CloudWatch Logs Insights (queries)
- CloudWatch Metrics & Alarms
- X-Ray (distributed tracing)
- CloudWatch Dashboards
- Custom metrics
- Structured logging (JSON)
- Correlation IDs

**3rd party tools:**

- Datadog
- New Relic
- Lumigo (specifically for serverless)

---

### 5.2. Security

**Что освоить:**

- IAM (Roles, Policies, Boundaries)
- Least Privilege Principle
- Secrets Manager vs Parameter Store
- KMS (encryption keys)
- VPC for Lambda (когда нужно)
- WAF & Shield
- Cognito (auth)
- Resource-based policies

**Tech Lead уровень:**

- Multi-account strategy (Organizations)
- Service Control Policies (SCP)
- AWS Config & GuardDuty

---

### 5.3. Cost Optimization

**Что освоить:**

- Cost Explorer & Budgets
- Reserved Capacity / Savings Plans
- Spot instances для ECS/Batch
- S3 Intelligent-Tiering
- DynamoDB On-Demand vs Provisioned
- Lambda Power Tuning (оптимизация memory)
- Tagging strategy

**КРИТИЧНО для Tech Lead:** Уметь сократить AWS bill на 30-50%

---

## 6. 🏗️ Phase 6: Infrastructure as Code (Weeks 16-18)

**💰 Impact: +$30K salary boost**

### 6.1. AWS CDK (рекомендую)

**Что освоить:**

- Constructs (L1, L2, L3)
- Stacks & Apps
- Context & Environments
- Asset bundling
- Custom Constructs
- Testing infrastructure

**Почему CDK > Terraform для AWS:**

- TypeScript (тот же язык что и backend)
- AWS-native (быстрее получает новые фичи)
- Higher-level abstractions

---

### 6.2. Альтернативы

- **Serverless Framework** — самый простой для Lambda
- **SAM (Serverless Application Model)** — AWS official
- **Terraform** — мультиоблачный
- **Pulumi** — современный, любой язык

---

## 7. 🎓 Phase 7: Architecture Patterns (Weeks 19-21)

**💰 Impact: TECH LEAD LEVEL** — отличает Senior от Tech Lead

### 7.1. Архитектурные паттерны

**Обязательно знать:**

- Event-Driven Architecture
- CQRS (Command Query Responsibility Segregation)
- Event Sourcing
- Saga Pattern (Choreography vs Orchestration)
- Circuit Breaker
- Bulkhead
- API Gateway pattern
- Backend for Frontend (BFF)
- Strangler Fig (migration pattern)

---

### 7.2. Microservices в AWS

**Что освоить:**

- Service Mesh (App Mesh)
- API Gateway как entry point
- Service-to-service communication
- Distributed transactions
- Eventual consistency
- Idempotency
- Versioning strategies

---

### 7.3. Multi-Region & Disaster Recovery

**Tech Lead must-know:**

- RPO & RTO concepts
- Active-Active vs Active-Passive
- DynamoDB Global Tables
- S3 Cross-Region Replication
- Route 53 failover
- Backup & Restore strategies

---

## 8. 📚 Phase 8: Tech Lead Skills (Weeks 22-24)

**💰 Impact: TECH LEAD ROLE** — финальный уровень

### 8.1. Architecture Decision Records (ADR)

- Документирование решений
- Trade-offs анализ
- C4 model для диаграмм

### 8.2. Cost & Performance Engineering

- AWS Well-Architected Framework (6 pillars)
- Performance testing (Artillery, k6)
- Load testing serverless
- Chaos engineering (AWS Fault Injection Simulator)

### 8.3. Team Leadership

- Code review для serverless
- Mentoring junior/middle devs
- Tech debt management
- Migration planning (monolith → serverless)
- On-call & incident management

---

## 9. 🏆 Сертификации (опционально, но плюс к резюме)

1. **AWS Certified Developer - Associate** (старт) — +$15K
2. **AWS Certified Solutions Architect - Associate** — +$25K
3. **AWS Certified Solutions Architect - Professional** — +$40K
4. **AWS Certified DevOps Engineer - Professional** — +$35K

---

## 10. 📅 Итоговый план обучения

| Phase | Длительность | Топик                     | Salary Impact |
| ----- | ------------ | ------------------------- | ------------- |
| 1     | 3 недели     | Lambda + API Gateway      | +$20-30K      |
| 2     | 3 недели     | DynamoDB + S3             | +$25-35K      |
| 3     | 3 недели     | SQS/SNS/EventBridge/Steps | +$35-50K      |
| 4     | 3 недели     | ECS/Fargate/Batch         | +$30-40K      |
| 5     | 3 недели     | Observability + Security  | +$25-35K      |
| 6     | 3 недели     | IaC (CDK)                 | +$30K         |
| 7     | 3 недели     | Architecture Patterns     | Tech Lead     |
| 8     | 3 недели     | Leadership Skills         | Tech Lead     |

**Итого: 6 месяцев → Senior Backend → Tech Lead уровень**

---

## 11. 🎯 Чек-лист готовности к Tech Lead роли

### 11.1. Технический уровень

- [ ] Могу спроектировать serverless приложение с нуля
- [ ] Знаю, когда Lambda НЕ подходит и что использовать вместо
- [ ] Умею оптимизировать AWS bill на 30%+
- [ ] Могу провести архитектурное ревью
- [ ] Знаю trade-offs всех serverless сервисов
- [ ] Умею писать IaC (CDK/Terraform)
- [ ] Понимаю multi-region & DR стратегии

### 11.2. Лидерские навыки

- [ ] Могу провести technical interview
- [ ] Умею писать ADR (Architecture Decision Records)
- [ ] Могу планировать migration (monolith → serverless)
- [ ] Знаю, как менторить команду
- [ ] Понимаю tech debt и могу его приоритизировать

---

## 12. 🚀 Следующий шаг

После анализа этого роадмапа — обсудим **топ 5 pet-проектов**, которые покроют все эти сервисы на практике. Каждый проект будет фокусироваться на конкретной фазе и реальных бизнес-кейсах.

**Идеи проектов (preview):**

1. **Serverless URL Shortener** — Lambda + API Gateway + DynamoDB
2. **Event-Driven E-commerce** — Step Functions + Saga pattern
3. **Video Processing Pipeline** — S3 + Lambda + Batch + ECS
4. **Real-time Analytics Dashboard** — Kinesis + Lambda + DynamoDB + WebSockets
5. **Multi-tenant SaaS Platform** — полный production-ready проект

Готов обсудить детали каждого проекта когда проанализируешь план! 🚀
