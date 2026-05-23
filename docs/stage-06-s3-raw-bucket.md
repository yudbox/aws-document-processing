# Этап 6. S3 bucket для raw документов — Шпаргалка для собеседования

> Уровень: Full Stack Tech Lead / Senior Engineer
> Формат: минимум кода, максимум аналогий и схем

---

## Содержание

1. [S3 bucket naming rules — globally unique](#1-s3-bucket-naming-rules--globally-unique)
2. [S3 versioning, lifecycle, encryption](#2-s3-versioning-lifecycle-encryption)
3. [SSE-S3 vs SSE-KMS — шифрование в деталях](#3-sse-s3-vs-sse-kms--шифрование-в-деталях)
4. [S3 CORS configuration — для прямой загрузки с клиента](#4-s3-cors-configuration--для-прямой-загрузки-с-клиента)
5. [S3 Block Public Access settings](#5-s3-block-public-access-settings)
6. [CDK `aws-cdk-lib/aws-s3` — основные свойства](#6-cdk-aws-cdk-libaws-s3--основные-свойства)

---

## 1. S3 bucket naming rules — globally unique

### Аналогия: имя домена в интернете

S3 bucket name — это как доменное имя: оно одно на весь интернет. Если кто-то уже занял `my-bucket`, вы не можете создать bucket с таким же именем — даже в другом аккаунте, другом регионе.

```
AWS глобальное пространство имён S3:
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  my-company-uploads    ← занято Amazon (пример)               │
│  photos                ← занято кем-то                        │
│  docprocess-raw-501044375484-eu-central-1  ← доступно (ваше)  │
│                                                                │
│  Все аккаунты, все регионы — одно пространство имён            │
└────────────────────────────────────────────────────────────────┘
```

### Правила именования

```
┌──────────────────────────────────────────────────────────────────┐
│ Правило                          │ Пример                       │
├──────────────────────────────────┼──────────────────────────────┤
│ Длина: 3–63 символа              │ ab  ← слишком короткое ❌    │
│                                  │ abc ← минимум ✅             │
├──────────────────────────────────┼──────────────────────────────┤
│ Только строчные буквы,           │ MyBucket   ← заглавные ❌    │
│ цифры, дефисы, точки             │ my-bucket  ← OK ✅           │
├──────────────────────────────────┼──────────────────────────────┤
│ Начало и конец: буква или цифра  │ -bucket    ← ❌              │
│ (не дефис и не точка)            │ bucket-    ← ❌              │
├──────────────────────────────────┼──────────────────────────────┤
│ НЕ может выглядеть как IP адрес  │ 192.168.1.1 ← ❌             │
├──────────────────────────────────┼──────────────────────────────┤
│ Не использовать точки            │ my.bucket.name               │
│ (проблемы с SSL wildcard certs)  │ ← технически можно, но ❌    │
└──────────────────────────────────┴──────────────────────────────┘
```

### Паттерн именования для production

```
Проблема: как гарантировать уникальность не гадая?

Решение — включить в имя то что уникально по определению:
  {проект}-{назначение}-{account-id}-{region}

Пример:
  docprocess-raw-501044375484-eu-central-1
  docprocess-results-501044375484-eu-central-1

CDK делает это автоматически если не задать имя явно:
  new Bucket(this, 'RawBucket')
  → имя генерируется: docprocess-rawbucket-a1b2c3d4e5f6

Явное имя через Fn.sub или Token:
  bucketName: `docprocess-raw-${this.account}-${this.region}`
```

### Bucket URL форматы

```
Virtual-hosted style (рекомендуемый):
  https://{bucket}.s3.{region}.amazonaws.com/{key}
  https://docprocess-raw-501044375484-eu-central-1.s3.eu-central-1.amazonaws.com/uploads/doc.pdf

Path style (устаревший, будет удалён):
  https://s3.{region}.amazonaws.com/{bucket}/{key}

Pre-signed URL использует virtual-hosted style автоматически.
```

---

## 2. S3 versioning, lifecycle, encryption

### Versioning — зачем нужна

```
Без versioning:
  PUT uploads/doc.pdf   → версия 1
  PUT uploads/doc.pdf   → ПЕРЕЗАПИСЫВАЕТ версию 1, старая потеряна навсегда

С versioning:
  PUT uploads/doc.pdf   → версия ID: aaa111
  PUT uploads/doc.pdf   → версия ID: bbb222  (aaa111 сохранена)
  DELETE uploads/doc.pdf → Delete Marker добавляется, файл не удалён!

  aws s3api list-object-versions → показывает все версии
  aws s3api get-object --version-id aaa111 → восстановить старую версию
```

```
Когда versioning нужна:
  ✅ Compliance (SOX, HIPAA) — нужна история изменений
  ✅ Защита от случайного удаления
  ✅ Для S3 Replication (требует versioning)

Когда versioning НЕ нужна (или осторожно):
  ❌ Raw bucket для временных файлов — versioning × lifecycle = деньги
     (удалённые файлы с Delete Marker тоже занимают место)
  ❌ Очень частые перезаписи одного объекта
```

### Lifecycle rules — экономия денег

```
Аналогия: архив в офисе.

  Свежие документы → на рабочем столе (S3 Standard)
  Документы 3 месяца → в шкафу (S3 Infrequent Access)
  Документы 1 год → в подвале (S3 Glacier)
  Документы 7 лет → уничтожить (Expiration)

S3 Lifecycle автоматизирует это:

  Rule 1: Transition after 30 days → Standard-IA
    (на 40% дешевле Standard, но минимум 30 дней хранения, плата за чтение)

  Rule 2: Transition after 90 days → Glacier Instant Retrieval
    (на 68% дешевле Standard, доступ за миллисекунды)

  Rule 3: Expiration after 7 days
    (просто удалить файл — для raw bucket где файлы временные)
```

### Storage classes — сравнение

```
┌──────────────────────────┬──────────────┬──────────────┬────────────────────┐
│ Storage Class            │ Стоимость    │ Retrieval    │ Минимум хранения   │
│                          │ $/GB/мес     │              │                    │
├──────────────────────────┼──────────────┼──────────────┼────────────────────┤
│ Standard                 │ $0.023       │ мгновенно    │ нет                │
│                          │ (базовая)    │ бесплатно    │                    │
├──────────────────────────┼──────────────┼──────────────┼────────────────────┤
│ Standard-IA              │ $0.0125      │ мгновенно    │ 30 дней            │
│ (Infrequent Access)      │ (-46%)       │ $0.01/GB     │                    │
├──────────────────────────┼──────────────┼──────────────┼────────────────────┤
│ Glacier Instant          │ $0.004       │ мгновенно    │ 90 дней            │
│ Retrieval                │ (-83%)       │ $0.03/GB     │                    │
├──────────────────────────┼──────────────┼──────────────┼────────────────────┤
│ Glacier Flexible         │ $0.0036      │ минуты-часы  │ 90 дней            │
│ Retrieval                │ (-84%)       │ $0.01/GB+    │                    │
├──────────────────────────┼──────────────┼──────────────┼────────────────────┤
│ Deep Archive             │ $0.00099     │ 12-48 часов  │ 180 дней           │
│                          │ (-96%)       │ $0.02/GB     │                    │
└──────────────────────────┴──────────────┴──────────────┴────────────────────┘

Intelligent-Tiering: AWS сам перемещает объекты между классами
                     на основе паттерна доступа. Платите за мониторинг.
```

---

## 3. SSE-S3 vs SSE-KMS — шифрование в деталях

### Три типа server-side encryption

```
SSE = Server-Side Encryption
      (шифрование выполняется AWS при записи, дешифрование при чтении)

┌───────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  SSE-S3 (Server-Side Encryption with S3-Managed Keys)                │
│  ─────────────────────────────────────────────────────────────────    │
│  AWS управляет ключами полностью. Прозрачно для пользователя.         │
│  Аналогия: банковский сейф, где банк сам управляет мастер-ключом.     │
│  Алгоритм: AES-256                                                    │
│  Стоимость: бесплатно                                                 │
│  Аудит: нет (нельзя увидеть кто и когда использовал ключ)             │
│  Когда: большинство случаев, нет compliance требований                │
│                                                                       │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  SSE-KMS (Server-Side Encryption with AWS KMS Keys)                  │
│  ─────────────────────────────────────────────────────────────────    │
│  Вы управляете ключами через AWS KMS (Key Management Service).       │
│  Аналогия: ваш личный сейф в банке, вы держите дубликат ключа.       │
│  Два варианта ключа:                                                  │
│    - AWS Managed Key (aws/s3): бесплатно, ограниченный контроль      │
│    - Customer Managed Key (CMK): $1/мес, полный контроль + аудит     │
│  Стоимость CMK: $0.03 за 10000 API запросов к KMS                    │
│  Аудит: CloudTrail + KMS key policy — видно каждое обращение         │
│  Когда: compliance (HIPAA, PCI-DSS, SOC2), cross-account sharing     │
│                                                                       │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  SSE-C (Customer-Provided Keys)                                       │
│  ─────────────────────────────────────────────────────────────────    │
│  Вы передаёте ключ в каждом HTTP запросе. AWS не хранит ключ.        │
│  Редко используется. Сложно управлять. Не работает через Console.    │
│  Когда: экзотические compliance требования                            │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### Ключевое отличие SSE-S3 vs SSE-KMS

```
SSE-S3:
  Кто имеет доступ к bucket → тот имеет доступ к данным.
  Шифрование защищает только от физического доступа к диску.

SSE-KMS (с CMK):
  Кто имеет доступ к bucket + кто имеет доступ к KMS key → тот читает данные.
  Можно дать доступ к bucket но запретить читать данные (отозвав KMS права).
  Это называется "envelope encryption" (конвертное шифрование).

Envelope encryption:
  Данные → шифруются Data Encryption Key (DEK)
  DEK → шифруется Master Key (CMK в KMS)
  В S3 хранится: зашифрованные данные + зашифрованный DEK
  KMS хранит только CMK (никогда не отдаёт его наружу)
```

### Для нашего проекта

```
raw bucket → SSE-S3 достаточно
  - Pet project, нет compliance требований
  - Бесплатно
  - Документы временные (lifecycle 30 дней)

results bucket → SSE-S3 достаточно
  - Те же причины

Если бы был production с PII данными → SSE-KMS с CMK + CloudTrail
```

---

## 4. S3 CORS configuration — для прямой загрузки с клиента

### Почему CORS нужен для S3

```
Стандартный upload через сервер:
  Browser → POST /upload → API Server → PUT to S3
  ✅ Нет CORS проблем (S3 → Server: server-to-server)
  ❌ Файл проходит через сервер → дорого, медленно для больших файлов

Direct upload через pre-signed URL:
  Browser → PUT https://bucket.s3.amazonaws.com/key?X-Amz-Signature=...
  ❌ Браузер делает cross-origin запрос к другому домену (amazonaws.com)
  → CORS блокирует запрос если S3 не разрешил

  CORS нужен → S3 должен вернуть заголовки:
    Access-Control-Allow-Origin: https://your-app.com
    Access-Control-Allow-Methods: PUT
```

### Как работает CORS preflight

```
Браузер ПЕРЕД реальным PUT делает OPTIONS запрос (preflight):

  1. Browser → OPTIONS https://bucket.s3.amazonaws.com/key
              Origin: https://your-app.com
              Access-Control-Request-Method: PUT

  2. S3 смотрит в CORS конфиг:
     "Разрешён ли Origin https://your-app.com для метода PUT?"

  3. S3 → Browser:
     Access-Control-Allow-Origin: https://your-app.com  ← разрешаем
     Access-Control-Allow-Methods: PUT
     Access-Control-Max-Age: 3000  ← кэшировать preflight 50 минут

  4. Browser → PUT https://bucket.s3.amazonaws.com/key
     (реальный запрос с файлом)
```

### Структура CORS конфига

```
CORS = список правил (rules). Каждое правило:

  AllowedOrigins  → с каких доменов разрешаем запросы
  AllowedMethods  → HTTP методы (GET, PUT, POST, DELETE, HEAD)
  AllowedHeaders  → заголовки которые клиент может отправить
  ExposeHeaders   → заголовки которые клиент может читать из response
  MaxAge          → секунды кэширования preflight результата

Для pet-project (разрешить всё):
  AllowedOrigins: ["*"]
  AllowedMethods: ["GET", "PUT", "HEAD"]
  AllowedHeaders: ["*"]

Для production (ограничить):
  AllowedOrigins: ["https://app.yourcompany.com"]
  AllowedMethods: ["PUT"]       ← только загрузка
  AllowedHeaders: ["Content-Type", "Content-MD5"]
  MaxAge: 3000
```

### Важный нюанс: CORS ≠ авторизация

```
CORS защищает браузер от нежелательных cross-origin запросов.
CORS НЕ защищает S3 от curl, Postman, серверных запросов.

curl PUT https://bucket.s3.amazonaws.com/key → не проверяет CORS

Безопасность S3 обеспечивается:
  1. Pre-signed URL (короткое время жизни, привязан к конкретному key)
  2. IAM политики (кто может что делать без подписи)
  3. Block Public Access (запрещает публичный доступ глобально)
```

---

## 5. S3 Block Public Access settings

### Что это и зачем

```
Аналогия: главный рубильник безопасности.

До Block Public Access: разработчик мог случайно сделать bucket публичным
через Bucket ACL или Bucket Policy. Это привело к громким утечкам данных
(Capital One 2019, GoDaddy 2020, etc.)

Block Public Access = 4 настройки которые override любые попытки
открыть публичный доступ. Даже если policy говорит "AllUsers: GetObject",
Block Public Access заблокирует это.
```

### Четыре настройки

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. BlockPublicAcls                                                   │
│    Блокирует добавление публичных ACL (Access Control Lists)         │
│    при PUT bucket/object с публичными ACL → ошибка 403              │
│                                                                      │
│ 2. IgnorePublicAcls                                                  │
│    Игнорирует существующие публичные ACL (даже если они есть)        │
│    Существующие публичные ACL → не дают публичного доступа           │
│                                                                      │
│ 3. BlockPublicPolicy                                                 │
│    Блокирует добавление публичных bucket policies                    │
│    PUT BucketPolicy с публичными правами → ошибка 403               │
│                                                                      │
│ 4. RestrictPublicBuckets                                             │
│    Ограничивает доступ: только аккаунт-владелец и IAM пользователи  │
│    Даже если bucket policy открыта для всех → только ваш аккаунт    │
└──────────────────────────────────────────────────────────────────────┘
```

### Три уровня Block Public Access

```
Уровень аккаунта (рекомендуется):
  AWS Console → S3 → Block Public Access (account settings)
  Включить все 4 настройки → защищает ВСЕ bucket в аккаунте
  Не позволяет случайно открыть любой bucket

Уровень bucket:
  При создании bucket (или позже)
  Включены по умолчанию для новых bucket с 2023 года

Уровень объекта:
  Нет — Block Public Access работает только на bucket уровне
```

### Когда НУЖНО отключать

```
Отключать Block Public Access нужно ТОЛЬКО для:
  ✅ Static website hosting (SPA на S3)
  ✅ Публичные assets (CDN origin без CloudFront OAC)

В нашем проекте:
  ❌ НЕ отключаем — все файлы приватные
  Клиент получает доступ только через pre-signed URLs (временные подписанные ссылки)
  Pre-signed URL работает даже с Block Public Access включённым
```

---

## 6. CDK `aws-cdk-lib/aws-s3` — основные свойства

### Основные свойства Bucket конструкта

```
new Bucket(this, 'RawBucket', {
  bucketName: ...,              ← имя (опционально, CDK генерирует если не указать)
  encryption: ...,              ← тип шифрования
  versioned: ...,               ← включить versioning
  blockPublicAccess: ...,       ← настройки Block Public Access
  cors: [...],                  ← CORS правила
  lifecycleRules: [...],        ← lifecycle правила
  removalPolicy: ...,           ← что делать при cdk destroy
  autoDeleteObjects: ...,       ← удалять объекты при destroy
  enforceSSL: ...,              ← требовать HTTPS для всех запросов
  publicReadAccess: ...,        ← разрешить публичное чтение (обычно false)
})
```

### BucketEncryption enum

```
BucketEncryption.S3_MANAGED
  → SSE-S3 (AES-256, AWS управляет ключами)
  → Включается заголовком x-amz-server-side-encryption: AES256

BucketEncryption.KMS_MANAGED
  → SSE-KMS с AWS Managed Key (aws/s3)
  → Бесплатно, нет аудита

BucketEncryption.KMS
  → SSE-KMS с Customer Managed Key
  → Нужно передать encryptionKey: myKmsKey
  → Полный контроль, CloudTrail аудит

BucketEncryption.DSSE_KMS
  → Dual-layer SSE-KMS (два слоя шифрования)
  → Для высоких compliance требований (US Government)

BucketEncryption.UNENCRYPTED
  → Без шифрования (не рекомендуется)
```

### BlockPublicAccess предустановки

```
BlockPublicAccess.BLOCK_ALL
  → Все 4 настройки включены (рекомендуется для private buckets)

BlockPublicAccess.BLOCK_ACLS
  → Только ACL блокируются, Policy может быть публичной

new BlockPublicAccess({         ← кастомная конфигурация
  blockPublicAcls: true,
  ignorePublicAcls: true,
  blockPublicPolicy: true,
  restrictPublicBuckets: true,
})
```

### RemovalPolicy — критически важное свойство

```
RemovalPolicy.RETAIN (дефолт для Bucket)
  → При cdk destroy: bucket ОСТАЁТСЯ в AWS
  → CloudFormation стек удаляется, но bucket продолжает существовать
  → Защита от случайного удаления данных
  → В production: всегда RETAIN

RemovalPolicy.DESTROY
  → При cdk destroy: попытка удалить bucket
  → Если bucket НЕ пустой → CloudFormation ошибка (bucket не удалится)
  → Нужно сначала очистить bucket вручную
  → В dev: DESTROY + autoDeleteObjects: true

RemovalPolicy.SNAPSHOT
  → Не применимо к S3 (используется для RDS, ElastiCache)

autoDeleteObjects: true
  → CDK создаёт Lambda Custom Resource которая очищает bucket перед удалением
  → Используется только вместе с RemovalPolicy.DESTROY
  → НЕ использовать в production — можно случайно удалить все данные!
```

### enforceSSL — обязательно в production

```
enforceSSL: true
→ CDK добавляет bucket policy:
  {
    Effect: Deny,
    Principal: "*",
    Action: "s3:*",
    Resource: ["arn:...:bucket", "arn:...:bucket/*"],
    Condition: { Bool: { "aws:SecureTransport": "false" } }
  }

→ Все HTTP запросы (без TLS) → получают 403 Forbidden
→ Защита от man-in-the-middle атак и случайной передачи данных по HTTP

В production это обязательно. CDK предупреждает если не включено.
```

### Итоговый пример конфигурации для raw bucket

```
new Bucket(this, 'RawBucket', {
  bucketName: `docprocess-raw-${this.account}-${this.region}`,

  // Шифрование
  encryption: BucketEncryption.S3_MANAGED,
  enforceSSL: true,

  // Приватность
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  publicReadAccess: false,

  // Versioning отключена (файлы временные)
  versioned: false,

  // CORS для direct upload с браузера
  cors: [{
    allowedOrigins: ['*'],
    allowedMethods: [HttpMethods.GET, HttpMethods.PUT, HttpMethods.HEAD],
    allowedHeaders: ['*'],
    maxAge: 3000,
  }],

  // Lifecycle: удалять старые файлы
  lifecycleRules: [{
    expiration: Duration.days(30),
    id: 'DeleteOldRawFiles',
  }],

  // Защита от случайного удаления
  removalPolicy: RemovalPolicy.RETAIN,
})
```

---

## 7. Типичные вопросы на интервью

**Q: Почему S3 bucket names globally unique, а не per-account?**

> Исторически S3 использовал path-style URLs: `s3.amazonaws.com/{bucket}/{key}`. Для работы этого URL пространство имён должно быть глобальным. Сейчас рекомендуется virtual-hosted style (`{bucket}.s3.{region}.amazonaws.com`), но глобальная уникальность сохранена для обратной совместимости. На собеседовании стоит добавить: это создаёт риск "bucket squatting" — конкурент может занять ожидаемое имя вашего bucket.

**Q: В чём разница SSE-S3 и SSE-KMS? Когда выбирать KMS?**

> SSE-S3: AWS полностью управляет ключами, прозрачно и бесплатно, нет аудита. SSE-KMS: вы управляете ключами через KMS, есть CloudTrail аудит каждого обращения, можно отозвать доступ к данным через KMS key policy не удаляя файлы. KMS выбирать при compliance требованиях (HIPAA, PCI-DSS), необходимости аудита доступа к данным, или cross-account sharing с явным контролем доступа.

**Q: Зачем CORS на S3 bucket? Разве pre-signed URL не обходит CORS?**

> Pre-signed URL содержит подпись и разрешает запрос на уровне IAM, но CORS — это браузерный механизм безопасности, не IAM. Браузер делает preflight OPTIONS запрос ПЕРЕД отправкой данных, независимо от наличия подписи. Если S3 не возвращает CORS заголовки — браузер блокирует запрос ещё до отправки файла. CORS настраивается отдельно, работает поверх IAM авторизации.

**Q: Что такое Block Public Access и почему это важно?**

> Block Public Access — глобальный override всех ACL и Policy, которые могли бы открыть публичный доступ к bucket. Появился как ответ на массовые утечки данных из неправильно сконфигурированных S3 bucket (Capital One, GoDaddy, Tesla). Включён по умолчанию для новых bucket с 2023 года. Даже если разработчик случайно добавит `"Principal": "*"` в bucket policy — Block Public Access предотвратит публичный доступ.

**Q: Что произойдёт при `cdk destroy` если bucket не пустой?**

> С RemovalPolicy.RETAIN (дефолт): CloudFormation stack удалится, но bucket останется — данные в безопасности. С RemovalPolicy.DESTROY без autoDeleteObjects: CloudFormation попытается удалить bucket, получит ошибку "BucketNotEmpty", deploy завершится с ошибкой, bucket останется. С RemovalPolicy.DESTROY + autoDeleteObjects: CDK создаёт Lambda Custom Resource, которая опустошит bucket перед удалением. В production никогда не ставить autoDeleteObjects — риск потери данных.
