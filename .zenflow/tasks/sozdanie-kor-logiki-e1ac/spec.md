# Technical Specification
# Платформа для проведения соревнований с экспертной оценкой

**Основан на**: `requirements.md` (PRD v1)

---

## 1. Технический контекст

### 1.1 Язык и рантайм

| Слой | Технология | Версия |
|------|-----------|--------|
| Runtime | Node.js | >= 20 LTS |
| Language | TypeScript | >= 5.4 |
| Package Manager | npm | >= 10 |

TypeScript используется и на фронтенде, и на бэкенде. Strict mode включён.

### 1.2 Монорепозиторий

Проект организован как npm workspaces monorepo:

```
/
├── packages/
│   ├── shared/          # Общие типы, валидации, константы
│   ├── client/          # Фронтенд (Astro + React)
│   └── server/          # Бэкенд (Express + Prisma)
```

Пакет `shared` содержит:
- TypeScript-типы для API запросов/ответов
- Zod-схемы валидации (используются и на клиенте, и на сервере)
- Константы и enum'ы (статусы мероприятия, роли и т.д.)

### 1.3 Стек зависимостей

**Backend (`packages/server`)**:

| Назначение | Библиотека | Обоснование |
|-----------|-----------|-------------|
| HTTP-фреймворк | Express 4 | Зрелый, большая экосистема |
| ORM | Prisma | Типобезопасность, миграции, поддержка SQLite и PostgreSQL |
| БД (разработка) | SQLite | Нулевая настройка для разработки |
| БД (продакшен) | PostgreSQL | Надёжность, масштабируемость |
| WebSocket | ws | Легковесный, стандартный |
| Аутентификация | jsonwebtoken + bcrypt | JWT для сессий, bcrypt для хэширования паролей |
| Валидация | Zod | Общие схемы с клиентом |
| Файл-импорт CSV | csv-parse | Потоковый парсинг CSV |
| Файл-импорт XLSX | xlsx (SheetJS) | Чтение Excel-файлов |
| Файл-экспорт | xlsx (SheetJS) | Запись XLSX для экспорта результатов |
| Генерация PDF | PDFKit | Программная генерация PDF для дипломов |
| QR-коды | qrcode | Генерация QR-кодов (PNG/SVG) |
| Загрузка файлов | multer | Multipart form-data |
| UUID | crypto.randomUUID() | Нативная генерация UUID |

**Frontend (`packages/client`)**:

| Назначение | Библиотека | Обоснование |
|-----------|-----------|-------------|
| Мета-фреймворк | Astro 5 | SSR, Islands-архитектура |
| UI-фреймворк | React 19 | Интерактивные компоненты (islands) |
| Стили | Tailwind CSS 4 | Utility-first, mobile-first, rapid development |
| Состояние | Zustand | Лёгкий state management для React |
| HTTP-клиент | ky | Маленький, типобезопасный fetch-обёртка |
| Роутинг (SPA) | React Router 7 | Клиентская навигация для admin и jury панелей |
| Уведомления | react-hot-toast | Лёгкие toast-уведомления |
| Drag-and-drop | @dnd-kit/core | Сортировка очерёдности выступлений |
| Формы | React Hook Form + Zod resolver | Валидация форм с общими Zod-схемами |

**Инструменты разработки**:

| Назначение | Библиотека |
|-----------|-----------|
| Линтинг | ESLint 9 (flat config) |
| Форматирование | Prettier |
| Тестирование (unit) | Vitest |
| Тестирование (API) | Supertest |

---

## 2. Архитектура приложения

### 2.1 Общая схема

```
┌──────────────────────────────────────────┐
│               Клиент (Браузер)            │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │ Астро-страницы│  │ React SPA Islands│  │
│  │ (SSR/статика) │  │ (admin, jury)    │  │
│  └──────────────┘  └────────┬─────────┘  │
│                              │            │
│         HTTP REST API + WebSocket         │
└──────────────────────┬───────────────────┘
                       │
┌──────────────────────┴───────────────────┐
│          Backend (Express + ws)            │
│  ┌────────┐ ┌────────┐ ┌──────────────┐  │
│  │ Routes │ │  WS    │ │  Services    │  │
│  │ (REST) │ │ Server │ │ (бизнес-    │  │
│  │        │ │        │ │  логика)    │  │
│  └───┬────┘ └───┬────┘ └──────┬───────┘  │
│      └──────────┴─────────────┘          │
│                  │                        │
│          ┌───────┴────────┐               │
│          │  Prisma ORM    │               │
│          └───────┬────────┘               │
│                  │                        │
│          ┌───────┴────────┐               │
│          │ SQLite / PgSQL │               │
│          └────────────────┘               │
└──────────────────────────────────────────┘
```

### 2.2 Astro — подход к рендерингу

Astro используется в **гибридном режиме** (`output: 'hybrid'`):

- **Статические страницы** (prerender):
  - Главная страница / лендинг
  - Страница верификации дипломов (`/verify/[code]`) — SSR с кэшированием

- **React SPA Islands** (client-side rendering):
  - **Admin Panel** (`/admin/*`) — полноценное SPA-приложение организатора, рендерится как React island с `client:only="react"`. Внутренний роутинг через React Router.
  - **Jury Panel** (`/jury/[token]`) — SPA-приложение для жюри, также React island. Mobile-first.
  - **Public Verify** (`/verify/[code]`) — маленький React island для отображения данных верификации.

Astro-адаптер: `@astrojs/node` (standalone mode) — Astro и Express запускаются как единый Node.js процесс. Astro обслуживает фронтенд, Express — API. На dev-сервере Astro проксирует API-запросы на Express.

### 2.3 Backend — слоистая архитектура

```
Routes (контроллеры) → Services (бизнес-логика) → Prisma (доступ к данным)
                     ↕
              WebSocket Server
```

- **Routes**: Принимают HTTP-запросы, валидируют входные данные (Zod), вызывают сервисы, формируют ответы
- **Services**: Вся бизнес-логика, не зависят от HTTP
- **Prisma**: Единственная точка доступа к БД
- **WebSocket Server**: Уведомляет подключённых клиентов о событиях в реальном времени

### 2.4 Аутентификация и авторизация

**Организатор**:
- Регистрация/вход через email + пароль
- Пароли хэшируются через bcrypt (cost factor 12)
- При успешном входе выдаётся JWT (access token), срок жизни — 24 часа
- JWT передаётся в заголовке `Authorization: Bearer <token>`
- JWT содержит: `{ sub: organizerId, role: "organizer" }`
- Rate limiting на /auth/login: 5 попыток в минуту

**Жюри**:
- Вход по уникальной ссылке: `/jury/<token>`
- Token: 32 байта, crypto.randomBytes, hex-encoded (64 символа)
- Токен хранится в БД, привязан к конкретному member и мероприятию
- Не используется JWT — токен жюри проверяется напрямую по БД при каждом запросе
- Токен передаётся в заголовке `X-Jury-Token: <token>`

**Middleware авторизации**:
- `authOrganizer` — проверка JWT, извлечение организатора из claims
- `authJury` — проверка токена жюри, извлечение member из БД
- Маршруты `/api/organizer/*` защищены через `authOrganizer`
- Маршруты `/api/jury/*` защищены через `authJury`
- Маршруты `/api/public/*` доступны без авторизации (верификация дипломов)

---

## 3. Модель данных

### 3.1 ER-диаграмма (Prisma-модели)

```prisma
model Organizer {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  events Event[]
}

model Event {
  id          String      @id @default(uuid())
  organizerId String
  title       String
  description String?
  date        DateTime
  logoPath    String?     // путь к файлу логотипа
  status      EventStatus @default(DRAFT)
  timerDuration Int       @default(300)  // секунды, по умолчанию 5 мин
  uniqueTaskAssignment Boolean @default(false)

  // Презентация и оценка
  currentTeamId String?   // FK → Team: текущая выступающая команда
  scoringTeamId String?   // FK → Team: команда с открытым приёмом оценок
                          // null = приём закрыт для всех

  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  organizer       Organizer        @relation(fields: [organizerId], references: [id])
  currentTeam     Team?            @relation("EventCurrentTeam", fields: [currentTeamId], references: [id], onDelete: SetNull)
  scoringTeam     Team?            @relation("EventScoringTeam", fields: [scoringTeamId], references: [id], onDelete: SetNull)
  criteria        Criterion[]
  teams           Team[]           @relation("EventTeams")
  tasks           Task[]
  juryMembers     JuryMember[]
  diplomaSettings DiplomaSettings?

  @@index([organizerId])
}

enum EventStatus {
  DRAFT            // Черновик — можно редактировать всё
  ACTIVE           // Активно — идут выступления и оценка
  SCORING_CLOSED   // Оценка завершена — оценки заморожены
  COMPLETED        // Завершено — дипломы доступны
}

model Criterion {
  id          String @id @default(uuid())
  eventId     String
  name        String
  description String?
  maxScore    Int
  sortOrder   Int    @default(0)

  event  Event   @relation(fields: [eventId], references: [id], onDelete: Cascade)
  scores Score[]

  @@index([eventId])
}

model Team {
  id              String  @id @default(uuid())
  eventId         String
  name            String
  projectDescription String?
  taskId          String? // назначенное задание
  presentationOrder Int?   // порядок выступления (null = не задан)

  event        Event           @relation("EventTeams", fields: [eventId], references: [id], onDelete: Cascade)
  task         Task?           @relation(fields: [taskId], references: [id], onDelete: SetNull)
  participants Participant[]
  evaluations  TeamEvaluation[]
  diploma      Diploma?

  // Обратные связи для Event.currentTeamId / Event.scoringTeamId
  currentInEvents Event[] @relation("EventCurrentTeam")
  scoringInEvents Event[] @relation("EventScoringTeam")

  @@unique([eventId, name])
  @@index([eventId])
  @@index([taskId])
}

model Participant {
  id     String  @id @default(uuid())
  teamId String
  name   String
  email  String?

  team       Team            @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@index([teamId])
}

model Task {
  id          String         @id @default(uuid())
  eventId     String
  title       String
  description String?
  difficulty  TaskDifficulty @default(MEDIUM)

  event Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  teams Team[]

  @@index([eventId])
}

enum TaskDifficulty {
  LOW
  MEDIUM
  HIGH
}

model JuryMember {
  id         String   @id @default(uuid())
  eventId    String
  name       String
  email      String?
  token      String   @unique  // 64-char hex token для входа
  firstLogin DateTime?
  lastActive DateTime?

  event       Event            @relation(fields: [eventId], references: [id], onDelete: Cascade)
  evaluations TeamEvaluation[]

  @@index([eventId])
  @@index([token])
}

// Лист оценки: одна запись на пару (juryMember, team).
// Содержит статус и комментарий, общие для всех критериев.
model TeamEvaluation {
  id           String          @id @default(uuid())
  juryMemberId String
  teamId       String
  status       EvaluationStatus @default(DRAFT)
  comment      String?
  updatedAt    DateTime         @updatedAt

  juryMember JuryMember @relation(fields: [juryMemberId], references: [id], onDelete: Cascade)
  team       Team       @relation(fields: [teamId], references: [id], onDelete: Cascade)
  scores     Score[]

  @@unique([juryMemberId, teamId])
  @@index([teamId])
  @@index([juryMemberId])
}

model Score {
  id             String @id @default(uuid())
  evaluationId   String
  criterionId    String
  value          Int    // балл (0..maxScore)

  evaluation TeamEvaluation @relation(fields: [evaluationId], references: [id], onDelete: Cascade)
  criterion  Criterion      @relation(fields: [criterionId], references: [id], onDelete: Cascade)

  @@unique([evaluationId, criterionId])
  @@index([evaluationId])
}

enum EvaluationStatus {
  DRAFT
  CONFIRMED
}

model Diploma {
  id               String   @id @default(uuid())
  teamId           String   @unique
  verificationCode String   @unique  // короткий код для QR (nanoid, 12 символов)
  filePath         String?  // путь к сгенерированному PDF
  rank             Int      // место в рейтинге
  totalScore       Float    // итоговый средний балл
  generatedAt      DateTime @default(now())

  team       Team            @relation(fields: [teamId], references: [id], onDelete: Cascade)
}

model DiplomaSettings {
  id              String @id @default(uuid())
  eventId         String @unique
  backgroundPath  String?  // путь к фоновому изображению
  primaryColor    String   @default("#1a365d")
  textColor       String   @default("#1a202c")

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

```

### 3.2 Ключевые решения по данным

**Текущая команда и приём оценок**: Инвариант "одна текущая выступающая команда" обеспечивается через `Event.currentTeamId` (единственное поле, не булев флаг на Team). Приём оценок привязан к конкретной команде через `Event.scoringTeamId`. Когда `scoringTeamId = null` — приём закрыт для всех. При смене текущей команды организатор сначала закрывает приём (`scoringTeamId = null`), затем переключает `currentTeamId`. Серверная валидация оценок проверяет: `teamId === event.scoringTeamId`.

**TeamEvaluation и Score**: Оценка жюри моделируется двухуровневой структурой:
- `TeamEvaluation` — лист оценки уровня (juryMember, team). Содержит `status` (DRAFT/CONFIRMED) и `comment`. Один лист на пару.
- `Score` — отдельные баллы по критериям, дочерние записи `TeamEvaluation`.

При подтверждении оценки статус `TeamEvaluation` переводится в CONFIRMED. При повторном редактировании — возвращается в DRAFT до нового подтверждения.

**Файловое хранилище**: Загружаемые файлы (логотипы, фоны дипломов, CSV/XLSX) и сгенерированные PDF сохраняются в локальную директорию `uploads/` относительно корня проекта. Пути в БД хранятся относительными.

```
uploads/
├── logos/          # логотипы мероприятий
├── backgrounds/    # фоны дипломов
├── imports/        # временные файлы импорта
└── diplomas/       # сгенерированные PDF
```

---

## 4. API — REST-эндпоинты

Базовый URL: `/api`

Все ответы используют формат:
```typescript
// Успех
{ success: true, data: T }

// Ошибка
{ success: false, error: { code: string, message: string, details?: any } }
```

### 4.1 Аутентификация

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/register` | Регистрация организатора |
| POST | `/api/auth/login` | Вход организатора → JWT |

### 4.2 Мероприятия (Организатор)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/organizer/events` | Список мероприятий организатора |
| POST | `/api/organizer/events` | Создание мероприятия |
| GET | `/api/organizer/events/:eventId` | Детали мероприятия |
| PATCH | `/api/organizer/events/:eventId` | Обновление мероприятия |
| POST | `/api/organizer/events/:eventId/logo` | Загрузка логотипа (multipart) |
| PATCH | `/api/organizer/events/:eventId/status` | Смена статуса мероприятия |

### 4.3 Критерии (Организатор)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/organizer/events/:eventId/criteria` | Список критериев |
| POST | `/api/organizer/events/:eventId/criteria` | Добавление критерия |
| PATCH | `/api/organizer/events/:eventId/criteria/:criterionId` | Редактирование критерия |
| DELETE | `/api/organizer/events/:eventId/criteria/:criterionId` | Удаление критерия |
| PUT | `/api/organizer/events/:eventId/criteria/order` | Изменение порядка критериев |

### 4.4 Команды и участники (Организатор)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/organizer/events/:eventId/teams` | Список команд с участниками |
| POST | `/api/organizer/events/:eventId/teams` | Создание команды |
| PATCH | `/api/organizer/events/:eventId/teams/:teamId` | Редактирование команды |
| DELETE | `/api/organizer/events/:eventId/teams/:teamId` | Удаление команды |
| POST | `/api/organizer/events/:eventId/teams/:teamId/participants` | Добавление участника |
| PATCH | `/api/organizer/events/:eventId/teams/:teamId/participants/:participantId` | Редактирование участника |
| DELETE | `/api/organizer/events/:eventId/teams/:teamId/participants/:participantId` | Удаление участника |

### 4.5 Импорт (Организатор)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/organizer/events/:eventId/import/preview` | Загрузка файла + предпросмотр (multipart) |
| POST | `/api/organizer/events/:eventId/import/apply` | Применение импорта с маппингом |

**Предпросмотр** (`POST /import/preview`):
- Принимает CSV/XLSX файл
- Возвращает: заголовки колонок, первые 10 строк данных, автоматически предложенный маппинг (по эвристике названий)
- Сохраняет файл во временную директорию, возвращает `importId`

**Применение** (`POST /import/apply`):
```typescript
{
  importId: string;
  mapping: {
    teamName: number;      // индекс колонки → название команды
    participantName: number; // → имя участника
    email?: number;         // → email
    projectDescription?: number; // → описание проекта
  };
  // для повторного импорта:
  resolutions?: Array<{
    rowIndex: number;
    action: 'create' | 'merge';
    existingTeamId?: string; // при merge — с какой командой слить
  }>;
}
```

При повторном импорте:
1. Система сопоставляет названия команд из файла с существующими (exact match, case-insensitive)
2. Для однозначных совпадений — обновляет данные участников
3. Для неоднозначных/новых — возвращает список для ручного разрешения
4. Оценки существующих команд не затрагиваются

### 4.6 Задания (Организатор)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/organizer/events/:eventId/tasks` | Список заданий |
| POST | `/api/organizer/events/:eventId/tasks` | Создание задания |
| PATCH | `/api/organizer/events/:eventId/tasks/:taskId` | Редактирование задания |
| DELETE | `/api/organizer/events/:eventId/tasks/:taskId` | Удаление задания |
| POST | `/api/organizer/events/:eventId/teams/:teamId/assign-task` | Назначение задания команде |

### 4.7 Жюри — управление (Организатор)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/organizer/events/:eventId/jury` | Список жюри с активностью |
| POST | `/api/organizer/events/:eventId/jury` | Добавление члена жюри |
| DELETE | `/api/organizer/events/:eventId/jury/:juryMemberId` | Удаление члена жюри |
| POST | `/api/organizer/events/:eventId/jury/:juryMemberId/regenerate-token` | Перегенерация токена |
| GET | `/api/organizer/events/:eventId/jury/:juryMemberId/qr` | QR-код (PNG) |

### 4.8 Презентация — управление (Организатор)

| Метод | Путь | Описание |
|-------|------|----------|
| PUT | `/api/organizer/events/:eventId/presentation/order` | Задать порядок выступлений |
| POST | `/api/organizer/events/:eventId/presentation/current` | Установить текущую команду `{ teamId }` → обновляет `Event.currentTeamId` |
| POST | `/api/organizer/events/:eventId/presentation/timer` | Управление таймером (start/pause/reset) |
| PATCH | `/api/organizer/events/:eventId/presentation/scoring` | Открыть/закрыть приём оценок `{ open: boolean }` → `scoringTeamId = currentTeamId \| null` |

**POST /presentation/current**: Устанавливает `Event.currentTeamId`. Если `scoringTeamId` не null и отличается от нового `currentTeamId` — `scoringTeamId` автоматически сбрасывается в null (закрытие приёма оценок при смене команды). Рассылает WS-событие `team:current` всем жюри.

**PATCH /presentation/scoring**: Принимает `{ open: boolean }`.
- `open: true` — открывает приём оценок для текущей выступающей команды: устанавливает `scoringTeamId = currentTeamId`. Если `currentTeamId === null` — возвращает ошибку 400 (`NO_CURRENT_TEAM`).
- `open: false` — закрывает приём оценок: устанавливает `scoringTeamId = null`.

Приём оценок может быть открыт **только** для текущей выступающей команды — произвольный `teamId` не принимается. Это гарантирует, что жюри видит и оценивает одну и ту же команду. Рассылает WS-событие `scoring:status` всем жюри.

### 4.9 Оценка (Жюри)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/jury/event` | Данные мероприятия (из токена) |
| GET | `/api/jury/teams` | Список команд с статусами оценки |
| GET | `/api/jury/teams/:teamId` | Карточка команды + текущие оценки |
| PUT | `/api/jury/teams/:teamId/scores` | Сохранение оценок (draft) |
| POST | `/api/jury/teams/:teamId/scores/confirm` | Подтверждение оценки |

**PUT /jury/teams/:teamId/scores** (автосохранение):
```typescript
{
  scores: Array<{ criterionId: string; value: number }>;
  comment?: string;
}
```
Серверная валидация:
- `event.status === ACTIVE`
- `event.scoringTeamId === teamId` (приём оценок открыт именно для этой команды)
- Каждый `value` в пределах `0..criterion.maxScore`

Создаёт или обновляет `TeamEvaluation` (status=DRAFT) и дочерние `Score`. Если оценка была CONFIRMED — при изменении баллов статус возвращается в DRAFT.

**POST /jury/teams/:teamId/scores/confirm**:
Аналогичная валидация (`scoringTeamId === teamId`). Переводит `TeamEvaluation.status` в CONFIRMED. Требует, чтобы все критерии мероприятия имели заполненные баллы.

### 4.10 Результаты (Организатор)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/organizer/events/:eventId/results` | Итоговая таблица `?taskId=<uuid>` |
| GET | `/api/organizer/events/:eventId/results/export` | Экспорт (XLSX/CSV) `?format=xlsx&taskId=<uuid>` |

**GET /results** принимает необязательный query-параметр `taskId`. Если указан — в выборку попадают только команды с данным назначенным заданием. Рейтинг и места пересчитываются в рамках отфильтрованного набора.

**GET /results** возвращает:
```typescript
{
  filter: {
    taskId: string | null;  // null если фильтр не применён
  };
  teams: Array<{
    id: string;
    name: string;
    taskId: string;
    taskTitle: string;
    rank: number;
    totalAvgScore: number;
    criteriaScores: Array<{
      criterionId: string;
      criterionName: string;
      avgScore: number;
      juryScores: Array<{
        juryMemberId: string;
        juryName: string;
        value: number;
        isAnomaly: boolean;
        comment: string | null;
      }>;
    }>;
  }>;
  anomalyThreshold: number; // кол-во стандартных отклонений
}
```

**Выявление аномалий**: Для каждого критерия вычисляется среднее и стандартное отклонение среди оценок всех жюри. Оценка считается аномальной, если `|value - mean| > 2 * stddev`.

### 4.11 Дипломы (Организатор)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/organizer/events/:eventId/diploma-settings` | Настройки диплома |
| PUT | `/api/organizer/events/:eventId/diploma-settings` | Сохранение настроек |
| POST | `/api/organizer/events/:eventId/diploma-settings/background` | Загрузка фона (multipart) |
| GET | `/api/organizer/events/:eventId/diplomas/preview` | Предпросмотр (PDF для 1-й команды) |
| POST | `/api/organizer/events/:eventId/diplomas/generate` | Массовая генерация всех дипломов |
| GET | `/api/organizer/events/:eventId/diplomas/:teamId` | Скачивание PDF одной команды |
| GET | `/api/organizer/events/:eventId/diplomas/download-all` | Скачивание ZIP-архива |

### 4.12 Верификация дипломов (Публичный)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/public/verify/:code` | Данные диплома для верификации |

Возвращает: название мероприятия, дату, название команды, место, итоговый балл. Не требует авторизации.

---

## 5. WebSocket — Real-time обновления

### 5.1 Подключение

WebSocket-сервер работает на том же HTTP-сервере (upgrade запроса). Endpoint: `ws(s)://<host>/ws`

Клиент отправляет при подключении:
```json
{ "type": "auth", "role": "organizer", "token": "<jwt>", "eventId": "<event-uuid>" }
// или
{ "type": "auth", "role": "jury", "token": "<jury-token>" }
```

Для организатора `eventId` обязателен — сервер проверяет, что организатор является владельцем указанного мероприятия (`event.organizerId === jwt.sub`). Для жюри `eventId` определяется автоматически из привязки токена к мероприятию.

Сервер подтверждает:
```json
{ "type": "auth_ok", "eventId": "..." }
```

### 5.2 Серверные события (server → client)

| Событие | Получатели | Описание |
|---------|-----------|----------|
| `team:current` | jury | Смена текущей выступающей команды `{ teamId, teamName, projectDescription, taskTitle }` |
| `timer:state` | jury | Обновление таймера `{ running, remainingMs, expired }` |
| `scoring:status` | jury | Открытие/закрытие приёма оценок `{ scoringTeamId: string \| null }` |
| `scores:updated` | organizer | Жюри сохранил/подтвердил оценку `{ juryMemberId, teamId, status }` |
| `jury:activity` | organizer | Жюри зашёл/вышел `{ juryMemberId, online: boolean }` |

### 5.3 Реализация таймера

Таймер управляется на сервере (source of truth):
- Организатор отправляет HTTP POST `/presentation/timer` с действием `start`, `pause`, `reset`
- Сервер хранит состояние таймера в памяти (не в БД): `{ running: bool, remainingMs: number, startedAt?: timestamp }`
- При `running=true` — сервер рассылает `timer:state` всем жюри каждую секунду
- При `remainingMs <= 0` — сервер отправляет `timer:state` с `expired: true`
- Клиент жюри отображает полученное значение (не считает самостоятельно — для синхронизации)

**Ограничение MVP**: Состояние таймера хранится в памяти процесса и не переживает рестарт сервера. При рестарте таймер сбрасывается в состояние `{ running: false, remainingMs: event.timerDuration * 1000 }`. Это осознанное решение для MVP: таймер — вспомогательный инструмент выступления (не влияет на данные), и организатор может перезапустить его вручную. Для production-grade решения таймер следует персистить (БД или Redis).

### 5.4 Пинг/понг и переподключение

- Сервер отправляет ping каждые 30 секунд
- Клиент отвечает pong
- Если pong не получен за 10 секунд — соединение закрывается
- Клиент использует экспоненциальный backoff для переподключения: 1с, 2с, 4с, 8с, max 30с

---

## 6. Offline-устойчивость (Жюри)

### 6.1 Механизм

1. **Локальное хранилище**: Zustand store с persist-middleware (localStorage). Оценки жюри сохраняются локально при каждом изменении.

2. **Очередь синхронизации**: Несохранённые на сервере изменения помещаются в очередь:
   ```typescript
   interface PendingAction {
     id: string;           // UUID действия
     teamId: string;
     scores: Array<{ criterionId: string; value: number }>;
     comment?: string;
     type: 'save' | 'confirm';
     createdAt: number;    // timestamp
   }
   ```

3. **Синхронизация**: При восстановлении соединения (определяется по `navigator.onLine` + WebSocket reconnect):
   - Действия из очереди отправляются последовательно на сервер
   - При успехе — удаляются из очереди
   - При конфликте (409) — последняя запись побеждает (LWW — Last Write Wins)

4. **Индикация состояния**: UI отображает три статуса:
   - 🟢 Online — соединение активно, данные синхронизированы
   - 🟡 Syncing — идёт отправка данных
   - 🔴 Offline — нет соединения, данные сохраняются локально

### 6.2 Валидация при синхронизации

При сохранении оценки (и при синхронизации) сервер проверяет:
- Мероприятие в статусе ACTIVE
- Приём оценок открыт для данной команды (`event.scoringTeamId === teamId`)
- Значение балла в пределах 0..maxScore
- Жюри привязан к данному мероприятию

Если приём оценок закрылся (или был переключён на другую команду) пока жюри был офлайн — оценки из очереди для этой команды отклоняются с кодом `SCORING_CLOSED`. Клиент показывает уведомление с названием команды, оценки которой не были приняты.

---

## 7. Генерация дипломов (PDF)

### 7.1 Подход

Используется **PDFKit** для программной генерации PDF:

1. Создаётся PDF-документ формата A4 (горизонтальная ориентация)
2. Если загружен фон — накладывается как фоновое изображение
3. Размещаются элементы:
   - Логотип мероприятия (центр, верх)
   - Название мероприятия и дата
   - Текст "ДИПЛОМ" / "DIPLOMA"
   - Место в рейтинге (крупным шрифтом)
   - Название команды
   - Имена участников (перечисление)
   - Название задания
   - Итоговый балл
   - QR-код (нижний правый угол)
4. QR-код содержит URL: `https://<domain>/verify/<verificationCode>`
5. `verificationCode` генерируется через `nanoid` (12 символов, URL-safe)

### 7.2 Массовая генерация

- `POST /diplomas/generate` запускает генерацию для всех команд мероприятия
- Генерация выполняется последовательно (команда за командой)
- PDF сохраняются в `uploads/diplomas/<eventId>/<teamId>.pdf`
- Записи `Diploma` создаются/обновляются в БД
- Endpoint возвращает ответ после завершения всей генерации

### 7.3 Скачивание архива

- `GET /diplomas/download-all` создаёт ZIP-архив из всех PDF в `uploads/diplomas/<eventId>/`
- Используется `archiver` (npm-пакет) для потокового создания ZIP
- Архив стримится в ответ (не сохраняется на диск)

---

## 8. Структура исходного кода

```
/
├── package.json                 # workspace root
├── tsconfig.base.json           # базовый TS-конфиг
├── .gitignore
├── .env.example
│
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── types/
│   │       │   ├── event.ts       # Event, EventStatus
│   │       │   ├── team.ts        # Team, Participant
│   │       │   ├── task.ts        # Task, TaskDifficulty
│   │       │   ├── criterion.ts   # Criterion
│   │       │   ├── jury.ts        # JuryMember
│   │       │   ├── evaluation.ts   # TeamEvaluation, EvaluationStatus, Score
│   │       │   ├── diploma.ts     # Diploma, DiplomaSettings
│   │       │   ├── api.ts         # ApiResponse<T>, ApiError
│   │       │   └── index.ts
│   │       ├── schemas/
│   │       │   ├── event.schema.ts
│   │       │   ├── team.schema.ts
│   │       │   ├── task.schema.ts
│   │       │   ├── criterion.schema.ts
│   │       │   ├── jury.schema.ts
│   │       │   ├── evaluation.schema.ts
│   │       │   ├── import.schema.ts
│   │       │   └── index.ts
│   │       └── constants.ts       # enum-значения, лимиты и т.д.
│   │
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── src/
│   │       ├── index.ts             # точка входа, создание Express app + WS
│   │       ├── app.ts               # конфигурация Express (middleware, routes)
│   │       ├── config.ts            # env-переменные
│   │       ├── prisma.ts            # Prisma client singleton
│   │       ├── middleware/
│   │       │   ├── auth.ts          # authOrganizer, authJury
│   │       │   ├── error-handler.ts # глобальный обработчик ошибок
│   │       │   ├── rate-limit.ts    # rate limiter
│   │       │   └── validate.ts      # Zod-валидация body/params/query
│   │       ├── routes/
│   │       │   ├── auth.routes.ts
│   │       │   ├── event.routes.ts
│   │       │   ├── criterion.routes.ts
│   │       │   ├── team.routes.ts
│   │       │   ├── participant.routes.ts
│   │       │   ├── import.routes.ts
│   │       │   ├── task.routes.ts
│   │       │   ├── jury.routes.ts
│   │       │   ├── presentation.routes.ts
│   │       │   ├── evaluation.routes.ts
│   │       │   ├── results.routes.ts
│   │       │   ├── diploma.routes.ts
│   │       │   └── public.routes.ts
│   │       ├── services/
│   │       │   ├── auth.service.ts
│   │       │   ├── event.service.ts
│   │       │   ├── criterion.service.ts
│   │       │   ├── team.service.ts
│   │       │   ├── import.service.ts
│   │       │   ├── task.service.ts
│   │       │   ├── jury.service.ts
│   │       │   ├── presentation.service.ts
│   │       │   ├── evaluation.service.ts
│   │       │   ├── results.service.ts
│   │       │   └── diploma.service.ts
│   │       └── ws/
│   │           ├── server.ts         # WebSocket server setup
│   │           ├── handlers.ts       # обработка входящих сообщений
│   │           └── broadcaster.ts    # рассылка событий подписчикам
│   │
│   └── client/
│       ├── package.json
│       ├── tsconfig.json
│       ├── astro.config.mjs
│       ├── tailwind.config.ts
│       ├── public/
│       │   └── favicon.svg
│       └── src/
│           ├── pages/
│           │   ├── index.astro         # лендинг
│           │   ├── admin/
│           │   │   └── [...path].astro # catch-all → React SPA
│           │   ├── jury/
│           │   │   └── [token].astro   # → React SPA (Jury panel)
│           │   └── verify/
│           │       └── [code].astro    # → верификация диплома
│           ├── layouts/
│           │   └── Layout.astro        # базовый HTML-layout
│           ├── components/
│           │   ├── admin/              # React-компоненты организатора
│           │   │   ├── AdminApp.tsx     # корневой SPA-компонент
│           │   │   ├── EventList.tsx
│           │   │   ├── EventForm.tsx
│           │   │   ├── EventDashboard.tsx
│           │   │   ├── CriteriaManager.tsx
│           │   │   ├── TeamManager.tsx
│           │   │   ├── ImportWizard.tsx
│           │   │   ├── TaskManager.tsx
│           │   │   ├── JuryManager.tsx
│           │   │   ├── PresentationControl.tsx
│           │   │   ├── ResultsTable.tsx
│           │   │   ├── DiplomaSettings.tsx
│           │   │   └── ...
│           │   ├── jury/               # React-компоненты жюри
│           │   │   ├── JuryApp.tsx      # корневой SPA-компонент
│           │   │   ├── TeamCard.tsx
│           │   │   ├── ScoreForm.tsx
│           │   │   ├── TeamList.tsx
│           │   │   ├── Timer.tsx
│           │   │   ├── ConnectionStatus.tsx
│           │   │   └── ...
│           │   ├── verify/
│           │   │   └── VerifyDiploma.tsx
│           │   └── ui/                 # переиспользуемые UI-компоненты
│           │       ├── Button.tsx
│           │       ├── Input.tsx
│           │       ├── Modal.tsx
│           │       ├── Card.tsx
│           │       └── ...
│           ├── stores/
│           │   ├── auth.store.ts       # JWT, состояние организатора
│           │   ├── jury.store.ts       # состояние жюри + offline queue
│           │   └── ws.store.ts         # WebSocket состояние
│           ├── lib/
│           │   ├── api.ts              # HTTP-клиент (ky) с конфигурацией
│           │   ├── ws.ts              # WebSocket-клиент с reconnect
│           │   └── utils.ts
│           └── styles/
│               └── global.css          # Tailwind directives
```

---

## 9. Конфигурация и окружение

### 9.1 Environment-переменные

```env
# Server
DATABASE_URL="file:./dev.db"        # SQLite для разработки
JWT_SECRET="change-me-in-production"
PORT=3001
UPLOAD_DIR="./uploads"
BASE_URL="http://localhost:4321"     # URL фронтенда (для QR-кодов)

# Client (Astro)
PUBLIC_API_URL="http://localhost:3001/api"
PUBLIC_WS_URL="ws://localhost:3001/ws"
```

### 9.2 Скрипты

**Root package.json**:
```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "npm -w packages/server run dev",
    "dev:client": "npm -w packages/client run dev",
    "build": "npm -w packages/shared run build && npm -w packages/server run build && npm -w packages/client run build",
    "lint": "eslint packages/",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Server**:
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts"
  }
}
```

**Client**:
```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  }
}
```

---

## 10. Подход к верификации

### 10.1 Линтинг

- ESLint 9 с flat config, TypeScript parser
- Prettier для форматирования
- Команда: `npm run lint`

### 10.2 Тестирование

**Unit-тесты** (Vitest):
- Сервисный слой: бизнес-логика (расчёт рейтинга, аномалии, импорт/маппинг)
- Zod-схемы: валидация корректных и некорректных данных
- Утилиты: offline-очередь, WebSocket reconnect-логика

**Integration-тесты** (Vitest + Supertest):
- API-эндпоинты: CRUD операции, авторизация, edge cases
- Тестовая БД: SQLite in-memory через Prisma

**Ручное тестирование**:
- WebSocket: ручная проверка реального времени (таймер, переключение команд)
- Offline: отключение сети в DevTools, проверка очереди и синхронизации
- Генерация PDF: визуальная проверка дипломов

### 10.3 Команды

```bash
npm run lint          # ESLint + Prettier check
npm run test          # Все unit- и integration-тесты
npm run build         # Полная сборка (shared → server → client)
```
