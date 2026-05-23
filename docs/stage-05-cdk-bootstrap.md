# Этап 5. CDK Bootstrap — Шпаргалка для собеседования

> Уровень: Full Stack Tech Lead / Senior Engineer
> Формат: минимум кода, максимум аналогий и схем

---

## Содержание

1. [Что делает `cdk bootstrap` — CDKToolkit stack](#1-что-делает-cdk-bootstrap--cdktoolkit-stack)
2. [S3 bucket для CDK assets](#2-s3-bucket-для-cdk-assets)
3. [ECR repository для Docker images](#3-ecr-repository-для-docker-images)
4. [IAM роли, которые создаёт bootstrap](#4-iam-роли-которые-создаёт-bootstrap)
5. [Регионы AWS — что выбрать](#5-регионы-aws--что-выбрать)

---

## 1. Что делает `cdk bootstrap` — CDKToolkit stack

### Аналогия: склад перед стройкой

Прежде чем строить здание, нужно подготовить строительную площадку:

- арендовать склад для хранения стройматериалов
- установить кран
- выдать строителям пропуска

`cdk bootstrap` — это именно такая подготовка. Он создаёт вспомогательную инфраструктуру в вашем AWS аккаунте, без которой CDK не может деплоить реальные ресурсы.

### Что именно создаётся

```
cdk bootstrap aws://501044375484/eu-central-1
                    │                 │
                    │                 └── регион
                    └── AWS Account ID

После выполнения в AWS появляется CloudFormation stack:
  Имя: CDKToolkit

  Внутри стека создаются:
  ┌─────────────────────────────────────────────────────────────────┐
  │  CDKToolkit stack                                               │
  │                                                                 │
  │  ┌──────────────────────────┐  ┌──────────────────────────┐    │
  │  │  S3 Bucket               │  │  ECR Repository          │    │
  │  │  cdk-hnb659fds-assets-   │  │  cdk-hnb659fds-          │    │
  │  │  {account}-{region}      │  │  container-assets-       │    │
  │  │                          │  │  {account}-{region}      │    │
  │  │  Хранит Lambda ZIP       │  │  Хранит Docker images    │    │
  │  │  и другие файловые       │  │  до деплоя в ECS/Batch   │    │
  │  │  assets                  │  │                          │    │
  │  └──────────────────────────┘  └──────────────────────────┘    │
  │                                                                 │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │  IAM Roles (4 штуки)                                     │   │
  │  │  - DeploymentActionRole   (кто может делать deploy)      │   │
  │  │  - CloudFormationRole     (CF выполняет изменения)       │   │
  │  │  - FilePublishingRole     (загрузка assets в S3)         │   │
  │  │  - ImagePublishingRole    (push Docker images в ECR)     │   │
  │  └──────────────────────────────────────────────────────────┘   │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │  SSM Parameter                                           │   │
  │  │  /cdk-bootstrap/hnb659fds/version  ← версия bootstrap   │   │
  │  └──────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────┘
```

### Bootstrap — одноразовая операция

```
Bootstrap нужен:
  ✅ Один раз на каждую комбинацию аккаунт + регион
  ✅ При обновлении CDK CLI (если изменилась версия bootstrap)
  ✅ При добавлении нового региона деплоя

Bootstrap НЕ нужен:
  ❌ При каждом cdk deploy
  ❌ При изменении кода стеков
  ❌ При добавлении новых Lambda функций
```

### Версия bootstrap

CDK использует концепцию "bootstrap version". При `cdk deploy` CDK проверяет:

- какая версия bootstrap установлена в аккаунте (через SSM Parameter)
- требует ли текущая версия CDK CLI более новый bootstrap

Если версии несовместимы — `cdk deploy` упадёт с ошибкой и попросит перезапустить `cdk bootstrap`.

---

## 2. S3 bucket для CDK assets

### Зачем нужен отдельный S3 bucket

```
Проблема без bootstrap bucket:

  Разработчик → cdk deploy → ?

  CDK хочет создать Lambda Function.
  Lambda Function требует ZIP файл с кодом.
  ZIP файл нужно где-то хранить чтобы CloudFormation мог его забрать.
  Без bucket — некуда загрузить.

Решение с bootstrap bucket:

  Разработчик → cdk deploy → CDK загружает ZIP в S3 → CloudFormation
                              создаёт Lambda указывая на S3 объект
```

### Что попадает в bucket

```
cdk-hnb659fds-assets-{account}-{region}/
│
├── Lambda assets (ZIP архивы)
│   └── abc123def456.zip   ← esbuild собрал handler.ts → заархивировал
│
├── CloudFormation templates (если большие)
│   └── template-hash.json ← для шаблонов >51KB (CF лимит inline)
│
└── Static files
    └── custom-resource-scripts, etc.
```

### Имя bucket и хэш `hnb659fds`

```
Имя bucket: cdk-hnb659fds-assets-{accountId}-{region}

hnb659fds — это "qualifier" (квалификатор).
По умолчанию всегда hnb659fds (историческая константа).

Зачем qualifier нужен:
  - Позволяет иметь несколько bootstrap окружений в одном аккаунте
  - Например: dev bootstrap и prod bootstrap с разными правами
  - cdk bootstrap --qualifier myteam → другой bucket, другие роли

В нашем проекте: дефолтный квалификатор, один bootstrap.
```

### Версионирование и очистка

```
Bucket создаётся с versioning включённым.

Проблема: старые версии assets накапливаются и занимают место.
Решение: CDK добавляет lifecycle rule — удалять непомеченные версии через 30 дней.

Актуальные assets (используемые в деплое) помечены тегом → не удаляются.
Старые assets (от откатившихся или удалённых стеков) → удаляются через 30 дней.
```

---

## 3. ECR repository для Docker images

### Зачем ECR при bootstrap

```
Аналогия: Docker Hub — это публичный склад образов для всех.
          ECR — это приватный склад образов внутри вашего AWS аккаунта.

CDK bootstrap создаёт ОДИН ECR репозиторий для всех Docker assets проекта.
Имя: cdk-hnb659fds-container-assets-{account}-{region}

Используется когда:
  - cdk deploy загружает Docker image для ECS Task Definition
  - cdk deploy загружает Docker image для AWS Batch Job Definition
  - CDK DockerImageAsset (автоматический build + push при deploy)
```

### Поток Docker image при деплое

```
Разработчик
    │
    │  cdk deploy EcsStack
    ▼
CDK CLI обнаруживает DockerImageAsset
    │
    ▼
docker build -t ... ecs-worker/    ← локально
    │
    ▼
docker tag ... {account}.dkr.ecr.{region}.amazonaws.com/cdk-hnb659fds-...
    │
    ▼
aws ecr get-login-password | docker login    ← аутентификация в ECR
    │
    ▼
docker push {account}.dkr.ecr.{region}.amazonaws.com/cdk-hnb659fds-...:hash
    │
    ▼
CloudFormation создаёт ECS Task Definition
используя URL образа в ECR
```

### ECR Image Scanning

Bootstrap ECR репозиторий по умолчанию включает scan-on-push:

```
При каждом docker push:
  ECR автоматически сканирует образ на CVE уязвимости
  (используя Clair scanner под капотом)

Результаты доступны в AWS Console → ECR → репозиторий → Scan results

Для Tech Lead:
  - Basic scanning (бесплатно): проверяет OS пакеты
  - Enhanced scanning (платно): проверяет OS + application dependencies
  - В продакшн проекте — обязательно настроить Enhanced + алёрты
```

---

## 4. IAM роли, которые создаёт bootstrap

### Четыре роли CDKToolkit

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│  1. DeploymentActionRole                                               │
│  ─────────────────────────────────────────────────────────────────     │
│  Кто: CI/CD pipeline, разработчик                                      │
│  Что делает: assume эту роль чтобы начать deploy                       │
│  Права: вызывать CloudFormation API, читать SSM параметры              │
│                                                                        │
│  Аналогия: прораб на стройке. Принимает задание, координирует работу.  │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  2. CloudFormationExecutionRole                                        │
│  ─────────────────────────────────────────────────────────────────     │
│  Кто: сам CloudFormation сервис                                        │
│  Что делает: создаёт/обновляет/удаляет ресурсы (S3, Lambda, DynamoDB) │
│  Права: по умолчанию AdministratorAccess (настраивается)               │
│                                                                        │
│  Аналогия: строительная бригада. Непосредственно строит здание.        │
│  ВАЖНО: это та роль которую CloudFormation использует при apply.       │
│  В production её права должны быть ограничены (не AdministratorAccess) │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  3. FilePublishingRole                                                 │
│  ─────────────────────────────────────────────────────────────────     │
│  Кто: CDK CLI при cdk deploy                                           │
│  Что делает: загружает Lambda ZIP и другие файлы в S3 assets bucket    │
│  Права: s3:PutObject в bootstrap bucket                                │
│                                                                        │
│  Аналогия: водитель который привозит стройматериалы на склад.          │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  4. ImagePublishingRole                                                │
│  ─────────────────────────────────────────────────────────────────     │
│  Кто: CDK CLI при cdk deploy с Docker assets                           │
│  Что делает: push Docker images в bootstrap ECR репозиторий            │
│  Права: ecr:GetAuthorizationToken, ecr:BatchCheckLayerAvailability,    │
│         ecr:PutImage, ecr:InitiateLayerUpload, etc.                    │
│                                                                        │
│  Аналогия: водитель который привозит контейнеры в порт.                │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Цепочка assume role при деплое

```
Разработчик / CI
(IAM User / OIDC identity)
        │
        │  AssumeRole
        ▼
DeploymentActionRole
(может запускать CF, читать параметры)
        │
        │  Передаёт CF execution role
        ▼
CloudFormation
        │
        │  AssumeRole
        ▼
CloudFormationExecutionRole
(создаёт реальные ресурсы в AWS)
```

### Почему разделение ролей важно

Разделение по ответственности (Separation of Concerns) в IAM:

```
Кто инициирует deploy → DeploymentActionRole
  Минимум прав: только запустить CF, посмотреть статус

Кто создаёт ресурсы → CloudFormationExecutionRole
  Права: широкие, но ограниченные сервисами которые CDK использует

В production:
  CloudFormationExecutionRole НЕ должна быть AdministratorAccess.
  Вместо этого: список конкретных сервисов (s3:*, lambda:*, dynamodb:*, etc.)

  cdk bootstrap --cloudformation-execution-policies arn:aws:iam::aws:policy/PowerUserAccess
```

---

## 5. Регионы AWS — что выбрать

### Что такое регион

```
AWS Region = физически изолированный датацентр (или группа датацентров)
             в конкретном географическом месте.

┌──────────────────────────────────────────────────────────────────┐
│  Region: eu-central-1 (Frankfurt)                                │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  AZ-a        │  │  AZ-b        │  │  AZ-c        │           │
│  │ (Frankfurt   │  │ (Frankfurt   │  │ (Frankfurt   │           │
│  │  DC 1)       │  │  DC 2)       │  │  DC 3)       │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
│  AZ = Availability Zone. Отдельный датацентр внутри региона.     │
│  Расстояние между AZ: несколько км.                              │
│  Связь между AZ: приватная оптика, <2ms latency.                 │
└──────────────────────────────────────────────────────────────────┘
```

### Популярные регионы и их особенности

```
┌─────────────────┬──────────────────────────────────────────────────┐
│ Регион          │ Особенности                                      │
├─────────────────┼──────────────────────────────────────────────────┤
│ us-east-1       │ Первый регион AWS. Самый большой.                │
│ (N. Virginia)   │ Новые сервисы появляются здесь первыми.          │
│                 │ Самые низкие цены (исторически).                 │
│                 │ CloudFront, Route53 billing — только us-east-1.  │
│                 │ Выбрать: если хотите доступ ко всем новым        │
│                 │ сервисам и фичам сразу.                          │
├─────────────────┼──────────────────────────────────────────────────┤
│ eu-central-1    │ GDPR compliance — данные в EU.                   │
│ (Frankfurt)     │ Рядом с большинством EU пользователей.           │
│                 │ Все основные сервисы доступны.                   │
│                 │ Выбрать: если аудитория в Европе или             │
│                 │ требования локализации данных (GDPR).            │
├─────────────────┼──────────────────────────────────────────────────┤
│ eu-west-1       │ Ирландия. Старейший EU регион.                   │
│ (Ireland)       │ Чуть дешевле eu-central-1.                      │
├─────────────────┼──────────────────────────────────────────────────┤
│ ap-southeast-1  │ Сингапур. Для азиатской аудитории.               │
│ (Singapore)     │                                                  │
└─────────────────┴──────────────────────────────────────────────────┘
```

### Критерии выбора региона

```
1. Где находятся пользователи?
   Latency напрямую зависит от расстояния до датацентра.
   EU пользователи + eu-central-1 = ~10-30ms
   EU пользователи + us-east-1   = ~100-150ms

2. Требования к локализации данных
   GDPR: данные граждан EU должны храниться в EU.
   Это касается S3 buckets, DynamoDB tables, CloudWatch Logs.

3. Доступность нужных сервисов
   Некоторые сервисы доступны не во всех регионах.
   Проверить: https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/
   Для нашего проекта: Lambda, S3, DynamoDB, SQS, SNS, Step Functions,
   ECS, Batch — всё есть в eu-central-1 и us-east-1.

4. Стоимость
   Цены немного отличаются между регионами.
   us-east-1 — обычно самый дешёвый.
   eu-central-1 — на 5-15% дороже us-east-1.

5. Для pet-project / собеседования
   eu-central-1 если вы в Европе — разумный выбор.
   Демонстрирует понимание GDPR и data locality.
```

### Bootstrap привязан к региону

```
Bootstrap создаётся ОТДЕЛЬНО для каждого региона:

  cdk bootstrap aws://501044375484/eu-central-1   ← eu-central-1
  cdk bootstrap aws://501044375484/us-east-1      ← us-east-1

В каждом регионе создаётся свой CDKToolkit stack со своим S3 и ECR.

Если вы деплоите ресурсы в несколько регионов (multi-region architecture),
нужен bootstrap в каждом из них.

Для нашего проекта: один регион eu-central-1, один bootstrap.
```

### Регион в CDK коде

```
CDK читает регион из окружения:

Способ 1: ENV переменные при синте
  CDK_DEFAULT_ACCOUNT=501044375484
  CDK_DEFAULT_REGION=eu-central-1

Способ 2: Хардкод в app.ts (не рекомендуется — негибко)
  new MyStack(app, 'MyStack', {
    env: { account: '501044375484', region: 'eu-central-1' }
  })

Способ 3: Без привязки (Environment-agnostic стек)
  Не указывать env → стек деплоится в любой аккаунт/регион.
  Ограничение: нельзя делать lookup (AZ, AMI IDs, etc.)

В production: всегда явно указывать аккаунт и регион.
Предотвращает случайный деплой в prod когда хотели в dev.
```

---

## 6. Типичные вопросы на интервью

**Q: Зачем нужен `cdk bootstrap`? Почему нельзя сразу делать `cdk deploy`?**

> Bootstrap создаёт вспомогательную инфраструктуру — S3 bucket для хранения Lambda ZIP архивов и Docker образов, ECR репозиторий для контейнеров, и IAM роли для выполнения деплоя. CloudFormation не умеет принимать файлы напрямую при создании стека — нужно сначала загрузить их в S3. Без bootstrap некуда загружать assets, поэтому деплой упадёт с ошибкой.

**Q: Нужно ли запускать bootstrap при каждом деплое?**

> Нет. Bootstrap — одноразовая операция для каждой комбинации аккаунт + регион. После этого `cdk deploy` работает без bootstrap. Повторно bootstrap нужен только при обновлении версии CDK CLI, если изменилась схема CDKToolkit (CDK сам скажет об этом с ошибкой), или при добавлении нового региона деплоя.

**Q: Какие IAM роли создаёт bootstrap и зачем их четыре?**

> Bootstrap создаёт четыре роли с разделением ответственности: DeploymentActionRole — для инициирования деплоя (CI/CD или разработчик assume эту роль); CloudFormationExecutionRole — для самого CloudFormation при создании ресурсов; FilePublishingRole — для загрузки файловых assets в S3; ImagePublishingRole — для push Docker образов в ECR. Разделение позволяет применить принцип Least Privilege к каждому шагу процесса деплоя.

**Q: Чем отличаются регионы us-east-1 и eu-central-1? Какой выбрать?**

> us-east-1 — исторически первый регион, самые низкие цены, новые сервисы появляются здесь первыми. eu-central-1 (Frankfurt) — для EU пользователей: меньше latency, GDPR compliance (данные остаются в EU). Для проекта с европейской аудиторией или требованиями локализации данных — eu-central-1. Для pet-project без географических требований — us-east-1 как самый универсальный.

**Q: Что будет если запустить `cdk deploy` без bootstrap?**

> CDK завершится ошибкой вида: "This stack uses assets, so the toolkit stack must be deployed to the environment". CDK проверяет SSM Parameter `/cdk-bootstrap/hnb659fds/version` — если его нет, значит bootstrap не запускался. Решение: запустить `cdk bootstrap aws://{account}/{region}` и повторить деплой.

**Q: Можно ли иметь несколько bootstrap окружений в одном аккаунте?**

> Да, через qualifier. По умолчанию qualifier = `hnb659fds`, поэтому S3 bucket называется `cdk-hnb659fds-assets-...`. При запуске `cdk bootstrap --qualifier prod` создаётся отдельный CDKToolkit stack с другим именем и отдельными ресурсами. Это используется для изоляции dev и prod деплоев в одном аккаунте или для разных команд.
