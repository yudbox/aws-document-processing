# Этап 4. Структура монорепозитория — Шпаргалка для собеседования

> Уровень: Full Stack Tech Lead / Senior Engineer
> Формат: минимум кода, максимум аналогий и схем

---

## Содержание

1. [Монорепо подходы: npm workspaces / pnpm / nx / turborepo](#1-монорепо-подходы-npm-workspaces--pnpm--nx--turborepo)
2. [Разделение infrastructure vs application code](#2-разделение-infrastructure-vs-application-code)
3. [Best practices для Lambda кода (один handler — одна папка)](#3-best-practices-для-lambda-кода-один-handler--одна-папка)
4. [TypeScript path aliases](#4-typescript-path-aliases)

---

## 1. Монорепо подходы: npm workspaces / pnpm / nx / turborepo

### Что такое монорепо и зачем он нужен

**Мультирепо** (polyrepo) — каждый сервис в отдельном Git-репозитории.
**Монорепо** — все сервисы в одном Git-репозитории.

```
Мультирепо:
  github.com/company/lambdas-repo
  github.com/company/infrastructure-repo
  github.com/company/ecs-worker-repo
  github.com/company/shared-utils-repo

  Проблема: изменение shared типа → нужно обновить 4 репозитория,
  4 PR, 4 ревью, 4 релиза. Версии могут разъехаться.

Монорепо:
  github.com/company/document-processing  ← всё здесь
    ├── infrastructure/
    ├── lambdas/
    ├── ecs-worker/
    └── shared/

  Изменение shared типа → один PR, один ревью, атомарное обновление.
```

### Аналогия: офис vs удалённые сотрудники

```
Мультирепо = каждый сотрудник работает из дома, общается по email.
  + Независимость, своя скорость
  - Долгая координация, «а у тебя какая версия shared?»

Монорепо = open-space офис.
  + Все видят изменения друг друга мгновенно
  + Единый стиль (один eslint, один tsconfig)
  - Нужна дисциплина, иначе хаос
```

### Инструменты монорепо — сравнительная таблица

```
┌─────────────────┬────────────────────────────────────────────────────────────────┐
│ Инструмент      │ Роль и характеристика                                          │
├─────────────────┼────────────────────────────────────────────────────────────────┤
│ npm workspaces  │ Пакетный менеджер + linking                                    │
│                 │ Встроен в npm 7+. Нет build orchestration.                     │
│                 │ Умеет: hoisting node_modules, symlinks между пакетами.         │
│                 │ Не умеет: кэшировать таски, запускать в правильном порядке.   │
├─────────────────┼────────────────────────────────────────────────────────────────┤
│ pnpm workspaces │ Альтернативный пакетный менеджер (не npm).                     │
│                 │ Преимущество: content-addressable store, не дублирует пакеты.  │
│                 │ Экономит до 60% дискового пространства.                        │
│                 │ Strict mode: пакет не может использовать транзитивные deps.    │
├─────────────────┼────────────────────────────────────────────────────────────────┤
│ Turborepo       │ Task runner / build system поверх npm/pnpm workspaces.         │
│                 │ Умеет: кэширование тасков, параллельное выполнение,            │
│                 │ remote cache (Vercel), правильный порядок сборки (topological).│
│                 │ Не заменяет пакетный менеджер — дополняет его.                 │
├─────────────────┼────────────────────────────────────────────────────────────────┤
│ Nx              │ Полноценный monorepo framework (создан Nrwl).                  │
│                 │ Умеет: всё что Turborepo + code generation, affected analysis, │
│                 │ IDE плагин, собственная система плагинов.                      │
│                 │ Тяжелее и сложнее в настройке.                                │
│                 │ Выбирается для больших enterprise проектов.                    │
└─────────────────┴────────────────────────────────────────────────────────────────┘
```

### Что выбрано в этом проекте и почему

```
npm workspaces  ← управление пакетами, symlinks, hoisting
      +
Turborepo       ← orchestration: build, test, lint с кэшированием

Обоснование:
  ✅ npm встроен, не нужен отдельный пакетный менеджер
  ✅ Turborepo — минимальная конфигурация, быстрый старт
  ✅ Правильный порядок сборки: shared/ собирается до lambdas/
  ✅ Кэширование: повторный build не пересобирает непереизменённые пакеты
  ❌ Nx — избыточен для ~5 пакетов
  ❌ pnpm — добавляет переменную (новый инструмент в команде)
```

### Как работает Turborepo кэширование

```
Первый запуск `turbo run build`:
  shared/     → build → кэш [hash ABC]
  lambdas/upload-url/ → build → кэш [hash DEF]
  lambdas/get-document/ → build → кэш [hash GHI]
  Время: 30 секунд

Второй запуск (ничего не изменилось):
  shared/     → cache hit [hash ABC] → пропускаем
  lambdas/upload-url/ → cache hit [hash DEF] → пропускаем
  lambdas/get-document/ → cache hit [hash GHI] → пропускаем
  Время: < 1 секунды

Изменили shared/src/types.ts:
  shared/     → build → новый кэш [hash XYZ]
  lambdas/upload-url/ → зависит от shared → пересборка
  lambdas/get-document/ → зависит от shared → пересборка
  Время: только изменённые пакеты
```

---

## 2. Разделение infrastructure vs application code

### Почему разделение критично

```
Без разделения (антипаттерн):
  aws-document-processing/
  └── src/
      ├── stacks/          ← CDK код
      ├── handlers/        ← Lambda handlers
      └── worker/          ← Docker app

  Проблемы:
  - Lambda пытается импортировать CDK конструкты → размер бандла раздувается
  - Один package.json для всего → npm install тянет все зависимости везде
  - Нельзя независимо тестировать стеки и handlers
  - CI/CD не может деплоить только изменённую Lambda
```

```
С разделением (правильно):
  aws-document-processing/
  ├── infrastructure/   ← ТОЛЬКО CDK код. Зависимости: aws-cdk-lib, constructs.
  │                       Никогда не запускается в AWS. Запускается ЛОКАЛЬНО.
  │
  ├── lambdas/          ← ТОЛЬКО Lambda handlers. Зависимости: @aws-sdk/*, shared.
  │                       Запускается в AWS Lambda runtime (Node.js 20.x).
  │
  ├── ecs-worker/       ← Docker приложение. Зависимости: @aws-sdk/*, sharp, etc.
  │                       Запускается в Docker контейнере на Fargate.
  │
  └── shared/           ← Общие TypeScript типы и утилиты. Нет AWS зависимостей.
                          Импортируется как в infrastructure/, так и в lambdas/.
```

### Разные runtime — разные зависимости

```
┌──────────────────────┬────────────────────────────────────────────────────┐
│ Пакет                │ Где запускается                                    │
├──────────────────────┼────────────────────────────────────────────────────┤
│ aws-cdk-lib          │ Только локально (cdk synth / cdk deploy)           │
│                      │ В Lambda запрещён — это девелоперский инструмент   │
├──────────────────────┼────────────────────────────────────────────────────┤
│ @aws-sdk/client-s3   │ В Lambda, ECS, Batch                               │
│                      │ В CDK — для создания ресурсов, не для вызовов      │
├──────────────────────┼────────────────────────────────────────────────────┤
│ sharp / pdf-parse    │ Только в lambdas/ и ecs-worker/                    │
│                      │ В infrastructure — бессмысленно                    │
└──────────────────────┴────────────────────────────────────────────────────┘
```

### Правило границ пакетов

```
infrastructure/ → может импортировать: shared/
infrastructure/ → НЕ импортирует: lambdas/, ecs-worker/ напрямую
(CDK ссылается на Lambda как на путь к файлу, не как на npm import)

lambdas/*       → может импортировать: shared/
lambdas/*       → НЕ импортируют друг друга
(каждый handler независим — принцип Single Responsibility)

shared/         → не импортирует никого из проекта (только внешние либы)
```

---

## 3. Best practices для Lambda кода (один handler — одна папка)

### Принцип: один handler — одна папка

```
lambdas/
├── upload-url/
│   ├── handler.ts        ← точка входа
│   ├── package.json      ← свои зависимости (может отличаться)
│   └── tsconfig.json     ← extends ../tsconfig.base.json
│
├── get-document/
│   ├── handler.ts
│   ├── package.json
│   └── tsconfig.json
│
└── shared/
    ├── types.ts           ← DocumentRecord, ProcessingStatus, etc.
    ├── errors.ts          ← кастомные ошибки
    └── package.json
```

### Почему не один файл на все Lambda

```
Антипаттерн — один бандл на все функции:
  handlers/
  └── index.ts    ← export uploadUrl, getDocument, listDocuments, ...

  Проблемы:
  ❌ CDK NodejsFunction бандлит весь файл → все функции тянут все зависимости
  ❌ Cold start: Lambda грузит весь бандл даже если нужна одна функция
  ❌ Нельзя давать разные IAM права разным функциям (один деплоймент)
  ❌ Нельзя задать разные memory/timeout настройки
  ❌ Изменение одной функции = редеплой всех
```

```
Правильно — отдельная папка:
  ✅ CDK NodejsFunction(this, 'UploadUrl', { entry: 'lambdas/upload-url/handler.ts' })
     → esbuild бандлит ТОЛЬКО этот файл + его прямые зависимости
  ✅ Минимальный размер бандла → быстрый cold start
  ✅ Каждая функция = отдельная IAM роль с минимальными правами
  ✅ Независимые memory/timeout/runtime настройки
  ✅ Изменение upload-url → редеплой только upload-url Lambda
```

### CDK NodejsFunction и esbuild

```
CDK NodejsFunction — L2 конструкт который:

  1. Берёт TypeScript файл handler.ts
  2. Запускает esbuild (bundler, написан на Go, очень быстрый)
  3. Создаёт один минимальный .js файл со всеми зависимостями (tree-shaking)
  4. Упаковывает в ZIP
  5. Загружает в S3 (CDK assets bucket)
  6. Создаёт Lambda Function с этим ZIP

  Размер типичного handler после бандлинга: 50-200 KB
  vs npm install всех зависимостей: 50-200 MB

  AWS SDK v3 НЕ надо включать в бандл — он есть в Lambda runtime.
  NodejsFunction автоматически помечает @aws-sdk/* как external.
```

### Структура handler.ts

```
Стандартная структура файла handler:

  // 1. Импорты (только то что нужно)
  import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

  // 2. Инициализация клиентов ВНЕ handler функции
  //    (переиспользуется между warm invocations)
  const s3 = new S3Client({ region: process.env.AWS_REGION })

  // 3. Handler функция — чистая, тестируемая
  export const handler = async (event: APIGatewayProxyEventV2) => {
    // бизнес логика
  }

  Важно: клиенты создаются один раз при cold start,
  потом переиспользуются. Это снижает latency warm invocations.
```

### Lambda Layers — когда нужны

```
Lambda Layer — это ZIP с зависимостями, который монтируется в /opt/.
Несколько функций могут использовать один Layer.

Когда Layer нужен:
  ✅ Нативные бинарники (sharp, ffmpeg) — нельзя bundlить через esbuild
  ✅ Очень тяжёлые библиотеки (>50MB после бандлинга)
  ✅ Зависимости которые меняются редко — Layer кэшируется в Lambda

Когда Layer НЕ нужен (в нашем проекте):
  ❌ Обычные JS/TS зависимости — esbuild отлично с ними справляется
  Мы используем esbuild bundling, Layer нужен только для sharp/native binaries
```

---

## 4. TypeScript path aliases

### Проблема без алиасов

```
Относительные импорты в глубоко вложенных файлах:

  // lambdas/upload-url/handler.ts
  import { DocumentRecord } from '../../shared/types'
  import { ValidationError } from '../../shared/errors'
  import { logger } from '../../../shared/logger'

  Проблемы:
  ❌ Хрупко: переместили файл → все относительные пути сломались
  ❌ Нечитаемо: сколько '../' нужно — непонятно без IDE
  ❌ Рефакторинг = боль
```

### Решение: path aliases

```
С алиасами:

  // lambdas/upload-url/handler.ts
  import { DocumentRecord } from '@shared/types'
  import { ValidationError } from '@shared/errors'
  import { logger } from '@shared/logger'

  Чисто, не зависит от положения файла, self-documenting.
```

### Настройка в tsconfig

```json
// tsconfig.base.json (корень монорепо)
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["./shared/src/*"],
      "@lambdas/*": ["./lambdas/*/src/*"]
    }
  }
}
```

### Два уровня алиасов: TypeScript vs Runtime

```
TypeScript path aliases — это ТОЛЬКО для компилятора.
TypeScript знает где искать @shared/types при type-checking.

Но когда код ЗАПУСКАЕТСЯ (Node.js / esbuild), runtime не знает про @shared/*.

┌──────────────────────────────────────────────────────────────────┐
│  Инструмент        │ Как решает алиасы                           │
├──────────────────────────────────────────────────────────────────┤
│  tsc               │ НЕ резолвит алиасы — нужен tsconfig-paths  │
│  esbuild           │ ✅ Резолвит через plugins или tsconfig      │
│  NodejsFunction    │ ✅ esbuild автоматически читает tsconfig    │
│  ts-node           │ Нужен tsconfig-paths/register               │
│  Jest              │ Нужен moduleNameMapper в jest.config.js     │
└──────────────────────────────────────────────────────────────────┘
```

### Альтернатива алиасам: npm workspace imports

```
В монорепо с npm workspaces можно использовать package name как импорт:

  // shared/package.json
  { "name": "@doc-processing/shared" }

  // lambdas/upload-url/handler.ts
  import { DocumentRecord } from '@doc-processing/shared'

  npm workspaces автоматически создаёт symlink:
    node_modules/@doc-processing/shared → ../../shared/

  Преимущества перед алиасами:
  ✅ Работает в любом runtime без дополнительной конфигурации
  ✅ Чётко выражает что это отдельный пакет
  ✅ Можно опубликовать в npm registry если понадобится
  ✅ Версионирование через semver

  Именно этот подход предпочтителен в монорепо с npm workspaces.
```

### Итоговая схема: как всё связано

```
aws-document-processing/
│
├── package.json  ← npm workspaces: ["infrastructure", "lambdas/*", "ecs-worker"]
│                    turbo: { pipeline: { build: { dependsOn: ["^build"] } } }
│
├── tsconfig.base.json  ← strict: true, ES2022, commonjs, declarationMaps
│
├── shared/
│   ├── package.json  { "name": "@doc-processing/shared" }
│   └── src/types.ts  ← DocumentRecord, ProcessingStatus, ...
│
├── lambdas/
│   └── upload-url/
│       ├── package.json  { "dependencies": { "@doc-processing/shared": "*" } }
│       └── handler.ts    ← import { DocumentRecord } from '@doc-processing/shared'
│
└── infrastructure/
    ├── package.json  { "dependencies": { "aws-cdk-lib": "^2.x", "@doc-processing/shared": "*" } }
    └── lib/stacks/storage-stack.ts

Как это работает при `npm install` в корне:
  1. npm читает workspaces: ["infrastructure", "lambdas/*", ...]
  2. Создаёт symlink: node_modules/@doc-processing/shared → ./shared/
  3. Все пакеты могут импортировать @doc-processing/shared
  4. Один `npm install` в корне — всё готово
```

---

## 5. Типичные вопросы на интервью

**Q: В чём разница между монорепо и мультирепо? Когда выбирать монорепо?**

> Монорепо: все пакеты в одном Git репозитории. Атомарные изменения через все слои, единый toolchain, нет проблем версионирования shared кода. Мультирепо: каждый сервис отдельно, независимые релизы, больше изоляции. Монорепо выбирается когда пакеты тесно связаны и часто меняются вместе — как в нашем проекте где Lambda типы и CDK стеки эволюционируют синхронно.

**Q: Чем Turborepo отличается от npm workspaces?**

> npm workspaces — это про управление пакетами: hoisting зависимостей, symlinks между пакетами, `npm install` один раз для всего монорепо. Turborepo — про запуск тасков: знает граф зависимостей между пакетами, запускает build в правильном порядке, кэширует результаты, параллелизирует независимые таски. Они дополняют друг друга.

**Q: Почему каждая Lambda в отдельной папке, а не все в одном файле?**

> Изоляция на нескольких уровнях: esbuild бандлит только нужные зависимости → минимальный ZIP → быстрый cold start; каждая функция получает отдельную IAM роль с минимальными правами; независимые memory/timeout настройки; изменение одной функции не требует redeploy остальных. Это принцип Single Responsibility применённый к serverless архитектуре.

**Q: Что такое TypeScript path aliases и какие у них ограничения?**

> Path aliases — это маппинг `@shared/*` → `./shared/src/*` в tsconfig. Помогает писать чистые импорты без `../../`. Ограничение: TypeScript резолвит алиасы при type-checking, но скомпилированный JS их не знает — нужно либо настраивать bundler (esbuild через NodejsFunction делает это автоматически), либо использовать npm workspace package names как более надёжную альтернативу.

**Q: Как организовать shared код чтобы не дублировать типы между Lambda и CDK?**

> Создать отдельный пакет `@project/shared` в npm workspace — только TypeScript интерфейсы и утилиты без AWS SDK зависимостей. CDK код использует типы для type-safety при конфигурации environment variables. Lambda код использует те же типы для обработки данных. Один источник правды — изменение типа сразу видно в обоих местах. CDK никогда не попадает в Lambda бандл, только shared.
