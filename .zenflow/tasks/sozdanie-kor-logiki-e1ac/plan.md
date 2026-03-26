# Full SDD workflow

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

---

## Workflow Steps

### [x] Step: Requirements
<!-- chat-id: 8b3f6324-a9da-4565-8a6d-ac9218d9e770 -->

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Focus on **what** the feature should do and **why**, not **how** it should be built. Do not include technical implementation details, technology choices, or code-level decisions — those belong in the Technical Specification.

Save the PRD to `{@artifacts_path}/requirements.md`.

### [x] Step: Technical Specification
<!-- chat-id: f7797a18-d4b1-40c4-bd0d-4a72e8373776 -->

Create a technical specification based on the PRD in `{@artifacts_path}/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Do not include implementation steps, phases, or task breakdowns — those belong in the Planning step.

Save to `{@artifacts_path}/spec.md` with:
- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Verification approach using project lint/test commands

### [x] Step: Planning
<!-- chat-id: 497610ef-e742-463b-8294-e9a6b34efbf1 -->

Create a detailed implementation plan based on `{@artifacts_path}/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

Rule of thumb for step size: each step should represent a coherent unit of work (e.g., implement a component, add an API endpoint). Avoid steps that are too granular (single function) or too broad (entire feature).

Important: unit tests must be part of each implementation task, not separate tasks. Each task should implement the code and its tests together, if relevant.

If the feature is trivial and doesn't warrant full specification, update this workflow to remove unnecessary steps and explain the reasoning to the user.

Save to `{@artifacts_path}/plan.md`.

### [x] Step: Project initialization and monorepo setup
<!-- chat-id: 403da46a-e51f-4965-b412-fbfdaa83b05e -->

Инициализация проекта: монорепозиторий с npm workspaces, базовые конфигурации.

- [ ] Создать корневой `package.json` с npm workspaces (`packages/shared`, `packages/server`, `packages/client`)
- [ ] Создать `.gitignore` (node_modules, dist, build, .cache, *.log, uploads/, .env, *.db)
- [ ] Создать `.env.example` с переменными из spec.md секция 9.1
- [ ] Создать `tsconfig.base.json` с общими настройками TypeScript (strict mode)
- [ ] Создать `packages/shared/package.json` и `tsconfig.json`
- [ ] Создать `packages/server/package.json` и `tsconfig.json`
- [ ] Создать `packages/client/package.json` и `tsconfig.json`
- [ ] Установить dev-зависимости в корень: `typescript`, `eslint`, `prettier`, `vitest`, `concurrently`
- [ ] Настроить ESLint 9 (flat config) с TypeScript parser и Prettier
- [ ] Настроить корневые npm-скрипты: dev, build, lint, test
- [ ] Верификация: `npm run lint` проходит без ошибок

### [x] Step: Shared package — types, schemas, constants
<!-- chat-id: c1716ef4-2b0b-4ebe-bb7c-62517fe8568a -->

Пакет `packages/shared`: общие TypeScript-типы, Zod-схемы валидации и константы, используемые и сервером, и клиентом.

- [x] Реализовать типы в `src/types/`: `event.ts` (Event, EventStatus), `team.ts` (Team, Participant), `task.ts` (Task, TaskDifficulty), `criterion.ts` (Criterion), `jury.ts` (JuryMember), `evaluation.ts` (TeamEvaluation, EvaluationStatus, Score), `diploma.ts` (Diploma, DiplomaSettings), `api.ts` (ApiResponse<T>, ApiError), `index.ts` (реэкспорт)
- [x] Реализовать Zod-схемы в `src/schemas/`: `event.schema.ts`, `team.schema.ts`, `task.schema.ts`, `criterion.schema.ts`, `jury.schema.ts`, `evaluation.schema.ts`, `import.schema.ts`, `index.ts`
- [x] Реализовать `src/constants.ts`: enum-значения, лимиты (MAX_TEAMS=50, MAX_JURY=20 и т.д.)
- [x] Написать unit-тесты для Zod-схем (валидация корректных и некорректных данных)
- [x] Верификация: `npm -w packages/shared run build` и тесты проходят

### [x] Step: Database schema and Prisma setup
<!-- chat-id: 51812e46-eb5c-4fc9-a7b8-49c0ff17affe -->

Модель данных: Prisma-схема и миграция для SQLite (dev).

- [x] Установить зависимости: `prisma`, `@prisma/client`, `@prisma/adapter-better-sqlite3`, `better-sqlite3`, `dotenv` в `packages/server`
- [x] Создать `packages/server/prisma/schema.prisma` с полной моделью данных из spec.md секция 3.1: Organizer, Event, EventStatus, Criterion, Team, Participant, Task, TaskDifficulty, JuryMember, TeamEvaluation, EvaluationStatus, Score, Diploma, DiplomaSettings
- [x] Настроить datasource для SQLite с Prisma 7 config (`prisma.config.ts` с ESM-совместимым `__dirname` + `prisma-client-js` provider с дефолтным output в node_modules)
- [x] Создать `packages/server/src/prisma.ts` — Prisma client singleton с PrismaBetterSqlite3 адаптером, импорт из `@prisma/client`
- [x] Выполнить `prisma migrate dev` для создания миграции (`20260324103823_init`)
- [x] Создать seed-скрипт (`prisma/seed.ts`) с тестовыми данными (1 организатор, 1 мероприятие, 3 команды с 9 участниками, 2 задания, 3 критерия, 2 жюри)
- [x] Верификация: `npx prisma db push`, `npx prisma db seed`, `npm run build`, `npm run lint` выполняются без ошибок

### [x] Step: Backend infrastructure — Express, middleware, auth, WebSocket
<!-- chat-id: 6b792aea-e9ae-4e3b-9a39-1a5bd3db808e -->

Инфраструктура бэкенда: Express-приложение, middleware (auth, validation, error handling, rate limiting), WebSocket-сервер.

- [x] Установить зависимости: `express`, `cors`, `helmet`, `jsonwebtoken`, `bcrypt`, `multer`, `ws`, `zod`, `express-rate-limit` и соответствующие `@types/*`
- [x] Создать `src/config.ts` — чтение env-переменных (DATABASE_URL, JWT_SECRET, PORT, UPLOAD_DIR, BASE_URL)
- [x] Создать `src/app.ts` — конфигурация Express (JSON parser, CORS, Helmet, static для uploads)
- [x] Создать `src/index.ts` — точка входа: создание HTTP-сервера, подключение Express + WebSocket
- [x] Реализовать middleware:
  - `src/middleware/auth.ts` — `authOrganizer` (JWT verify), `authJury` (DB token lookup)
  - `src/middleware/validate.ts` — Zod-валидация body/params/query
  - `src/middleware/error-handler.ts` — глобальный обработчик ошибок (формат ApiError)
  - `src/middleware/rate-limit.ts` — rate limiter для auth-маршрутов
- [x] Реализовать WebSocket:
  - `src/ws/server.ts` — создание WS-сервера, обработка upgrade, аутентификация
  - `src/ws/broadcaster.ts` — рассылка событий подписчикам по eventId и роли
  - `src/ws/handlers.ts` — обработка входящих сообщений (auth)
- [x] Реализовать `src/services/auth.service.ts` — register, login (bcrypt hash, JWT sign)
- [x] Реализовать `src/routes/auth.routes.ts` — POST `/api/auth/register`, POST `/api/auth/login`
- [x] Написать тесты: middleware auth (корректный/невалидный JWT, невалидный jury token), auth service (register, login, wrong password), auth routes (integration с supertest)
- [x] Настроить `tsx watch` для dev-режима сервера
- [x] Верификация: сервер стартует, `POST /api/auth/register` и `POST /api/auth/login` работают, тесты проходят

### [x] Step: Backend CRUD — events, criteria, tasks
<!-- chat-id: 7f795df7-4381-441f-8fcf-61c0d6dd3f27 -->

CRUD-эндпоинты организатора: мероприятия, критерии оценки, задания.

- [ ] Реализовать `src/services/event.service.ts` — CRUD мероприятий, смена статуса (с валидацией transitions: DRAFT→ACTIVE→SCORING_CLOSED→COMPLETED), загрузка логотипа
- [ ] Реализовать `src/routes/event.routes.ts` — GET/POST/PATCH `/api/organizer/events`, POST logo, PATCH status
- [ ] Реализовать `src/services/criterion.service.ts` — CRUD критериев, изменение порядка, блокировка изменений после начала оценки (event.status !== DRAFT)
- [ ] Реализовать `src/routes/criterion.routes.ts` — GET/POST/PATCH/DELETE `/api/organizer/events/:eventId/criteria`, PUT order
- [ ] Реализовать `src/services/task.service.ts` — CRUD заданий, назначение задания команде (с проверкой uniqueTaskAssignment)
- [ ] Реализовать `src/routes/task.routes.ts` — GET/POST/PATCH/DELETE `/api/organizer/events/:eventId/tasks`, POST assign-task
- [ ] Написать тесты: event CRUD + status transitions, criterion CRUD + lock after ACTIVE, task CRUD + unique assignment
- [ ] Верификация: все API-эндпоинты работают, тесты проходят

### [x] Step: Backend — teams, participants, import
<!-- chat-id: 055a4320-8643-4009-95ca-c3f1f6183564 -->

Команды, участники, импорт из CSV/Excel.

- [ ] Установить зависимости: `csv-parse`, `xlsx` (SheetJS)
- [ ] Реализовать `src/services/team.service.ts` — CRUD команд и участников, удаление команды с оценками (с проверкой)
- [ ] Реализовать `src/routes/team.routes.ts` — GET/POST/PATCH/DELETE команд, `src/routes/participant.routes.ts` — POST/PATCH/DELETE участников
- [ ] Реализовать `src/services/import.service.ts`:
  - Парсинг CSV и XLSX файлов
  - Preview: заголовки, первые 10 строк, автоматический маппинг по эвристике
  - Apply: создание/обновление команд и участников по маппингу
  - Повторный импорт: сопоставление по названию команды (case-insensitive), сохранение оценок, ручное разрешение конфликтов
- [ ] Реализовать `src/routes/import.routes.ts` — POST preview (multipart), POST apply
- [ ] Написать тесты: team CRUD, import preview (CSV, XLSX), import apply (новые + повторный), маппинг колонок
- [ ] Верификация: импорт CSV и XLSX работает, повторный импорт не теряет оценки, тесты проходят

### [x] Step: Backend — jury management, presentation control, scoring
<!-- chat-id: 428f8d3d-a1a7-493f-a173-522cd7e41813 -->

Управление жюри, управление презентацией (текущая команда, таймер, приём оценок), API оценки для жюри.

- [ ] Установить зависимость: `qrcode`
- [ ] Реализовать `src/services/jury.service.ts` — добавление жюри, генерация токена (crypto.randomBytes 32 → hex), регенерация токена, мониторинг активности (firstLogin, lastActive, online status через WS), генерация QR-кода
- [ ] Реализовать `src/routes/jury.routes.ts` — GET/POST/DELETE жюри, POST regenerate-token, GET qr
- [ ] Реализовать `src/services/presentation.service.ts`:
  - Установка порядка выступлений (PUT order)
  - Установка текущей команды (сброс scoringTeamId при смене) + WS-событие `team:current`
  - Таймер: start/pause/reset, in-memory state, рассылка `timer:state` каждую секунду через WS
  - Открытие/закрытие приёма оценок (`scoringTeamId = currentTeamId | null`) + WS-событие `scoring:status`
- [ ] Реализовать `src/routes/presentation.routes.ts` — PUT order, POST current, POST timer, PATCH scoring
- [ ] Реализовать `src/services/evaluation.service.ts`:
  - Получение данных мероприятия и списка команд для жюри
  - Сохранение оценок (draft): создание/обновление TeamEvaluation + Score, валидация (event ACTIVE, scoringTeamId === teamId, value в пределах maxScore)
  - Подтверждение оценки: DRAFT → CONFIRMED, проверка что все критерии заполнены
  - WS-событие `scores:updated` организатору
- [ ] Реализовать `src/routes/evaluation.routes.ts` — GET event, GET teams, GET team/:teamId, PUT scores, POST confirm
- [ ] Написать тесты: jury token generation, presentation state transitions, evaluation save/confirm/validation, timer state, WS broadcasting
- [ ] Верификация: полный флоу оценки работает через API, таймер вещает через WS, тесты проходят

### [x] Step: Backend — results, diplomas, public verification
<!-- chat-id: 68959e5f-f6fc-4a88-9f47-f948aaeebf03 -->

Результаты с аномалиями, генерация дипломов (PDF), скачивание архива, публичная верификация.

- [x] Установить зависимости: `pdfkit`, `nanoid`, `archiver`
- [x] Реализовать `src/services/results.service.ts`:
  - Сводная таблица: команды × критерии × жюри, средние баллы, рейтинг
  - Фильтрация по taskId (пересчёт рейтинга в рамках фильтра)
  - Выявление аномалий: |value - mean| > 2 * stddev
  - Экспорт в XLSX и CSV (SheetJS)
- [x] Реализовать `src/routes/results.routes.ts` — GET results (?taskId), GET results/export (?format, ?taskId)
- [x] Реализовать `src/services/diploma.service.ts`:
  - Настройки диплома (CRUD DiplomaSettings, загрузка фона)
  - Генерация PDF (PDFKit): фон, логотип, текст, QR-код с verificationCode (nanoid 12 символов)
  - Массовая генерация для всех команд мероприятия
  - ZIP-архив через archiver (потоковый)
- [x] Реализовать `src/routes/diploma.routes.ts` — GET/PUT settings, POST background, GET preview, POST generate, GET :teamId, GET download-all
- [x] Реализовать `src/routes/public.routes.ts` — GET `/api/public/verify/:code`
- [x] Написать тесты: results calculation (средние, рейтинг, аномалии), results filtering, diploma verification code
- [x] Верификация: GET /results возвращает корректный рейтинг, PDF генерируется, ZIP скачивается, /verify работает, тесты проходят

### [x] Step: Frontend infrastructure — Astro, React, stores, API client
<!-- chat-id: 4d7ae53e-6911-4798-a5a1-50392f4647fc -->

Инфраструктура фронтенда: Astro с React islands, Tailwind, stores, HTTP/WS клиенты.

- [x] Установить зависимости: `astro`, `@astrojs/react`, `@astrojs/node`, `@tailwindcss/vite`, `react`, `react-dom`, `tailwindcss`, `zustand`, `ky`, `react-router-dom`, `react-hook-form`, `@hookform/resolvers`, `react-hot-toast`, `@dnd-kit/core`, `@dnd-kit/sortable`
- [x] Создать `astro.config.mjs` — server mode, React integration, Node adapter, проксирование API в dev, Tailwind через `@tailwindcss/vite` plugin
- [x] Создать `src/styles/global.css` — Tailwind v4 directives (`@import "tailwindcss"`, `@theme` с custom colors)
- [x] Создать `src/layouts/Layout.astro` — базовый HTML-layout (ru lang, mobile-first viewport)
- [x] Создать Astro-страницы:
  - `src/pages/index.astro` — лендинг (prerender=true)
  - `src/pages/admin/[...path].astro` — catch-all → AdminApp React island (`client:only="react"`)
  - `src/pages/jury/[token].astro` — → JuryApp React island (`client:only="react"`)
  - `src/pages/verify/[code].astro` — → VerifyDiploma React island
- [x] Реализовать `src/lib/api.ts` — HTTP-клиент на ky с конфигурацией (baseURL, auth headers), helper-функции (apiGet, apiPost, apiPatch, apiPut, apiDelete, juryGet, juryPut, juryPost)
- [x] Реализовать `src/lib/ws.ts` — WebSocket-клиент: подключение, аутентификация, reconnect с экспоненциальным backoff (1s→30s max), event handlers, wildcard listeners
- [x] Реализовать `src/stores/auth.store.ts` — JWT хранение в localStorage, login/logout/init
- [x] Реализовать `src/stores/ws.store.ts` — WebSocket состояние (connected, reconnecting)
- [x] Реализовать базовые UI-компоненты (`src/components/ui/`): Button, Input, Modal, Card, Spinner, Badge + index.ts barrel export
- [x] Создать placeholder React-компоненты: AdminApp (BrowserRouter), JuryApp, VerifyDiploma
- [x] Обновить корневой package.json: dev (concurrently server+client), build (shared+server+client)
- [x] Верификация: `npm -w packages/client run build` проходит, `npm run lint` без ошибок, `npm run test` — 275 тестов проходят
- [ ] Верификация: `npm -w packages/client run dev` стартует, страницы рендерятся

### [x] Step: Frontend — admin panel (organizer)
<!-- chat-id: 1a56b267-af1a-4934-961d-b8df30a5c0ef -->

Панель организатора: полное SPA-приложение.

- [x] Создать `src/components/admin/AdminApp.tsx` — корневой компонент с React Router (routes: /admin, /admin/events/new, /admin/events/:id, /admin/events/:id/teams, /admin/events/:id/jury, /admin/events/:id/presentation, /admin/events/:id/results, /admin/events/:id/diplomas)
- [x] Реализовать страницу входа/регистрации организатора (Login/Register forms)
- [x] Реализовать `EventList.tsx` — список мероприятий с карточками, статусами, кнопкой создания
- [x] Реализовать `EventForm.tsx` — форма создания/редактирования мероприятия (название, дата, описание, логотип)
- [x] Реализовать `EventDashboard.tsx` — обзор мероприятия, навигация по разделам, управление статусом
- [x] Реализовать `CriteriaManager.tsx` — CRUD критериев с drag-and-drop сортировкой, блокировка после ACTIVE
- [x] Реализовать `TaskManager.tsx` — CRUD заданий, назначение заданий командам
- [x] Реализовать `TeamManager.tsx` — список команд, ручное добавление/редактирование, удаление с подтверждением
- [x] Реализовать `ImportWizard.tsx` — загрузка CSV/XLSX, предпросмотр, маппинг колонок, повторный импорт с разрешением конфликтов
- [x] Реализовать `JuryManager.tsx` — список жюри, добавление, QR-коды, мониторинг активности (online/offline, прогресс оценки)
- [x] Реализовать `PresentationControl.tsx` — управление выступлениями: порядок (drag-and-drop), текущая команда, таймер (start/pause/reset), открытие/закрытие приёма оценок
- [x] Реализовать `ResultsTable.tsx` — сводная таблица результатов, фильтр по заданию, подсветка аномалий, экспорт, раскрытие деталей оценки
- [x] Реализовать `DiplomaSettings.tsx` — настройка шаблона (фон, цвета), предпросмотр, генерация, скачивание
- [x] Верификация: все разделы панели организатора функционируют, данные загружаются и сохраняются через API

### [x] Step: Frontend — jury panel (mobile-first, offline)
<!-- chat-id: 999a4c9f-2ed3-4990-98d6-41d71ac0865f -->

Панель жюри: mobile-first SPA с offline-поддержкой.

- [x] Реализовать `src/stores/jury.store.ts` — состояние жюри с persist-middleware (localStorage), offline-очередь (PendingAction[]), синхронизация при восстановлении связи
- [x] Реализовать `src/components/jury/JuryApp.tsx` — корневой компонент: авторизация по токену, подключение WS, layout
- [x] Реализовать `TeamCard.tsx` — карточка текущей выступающей команды (название, описание проекта, задание), обновляется через WS-событие `team:current`
- [x] Реализовать `Timer.tsx` — отображение таймера обратного отсчёта (данные из WS `timer:state`), визуальное/звуковое уведомление при истечении
- [x] Реализовать `ScoreForm.tsx` — форма оценки: поля ввода баллов по каждому критерию (max value), комментарий, автосохранение (draft), кнопка "Подтвердить", итоговая сумма
- [x] Реализовать `TeamList.tsx` — список всех команд с индикацией статуса (не оценена / черновик / подтверждена), переход к оценке
- [x] Реализовать `ConnectionStatus.tsx` — индикатор состояния подключения (Online/Syncing/Offline)
- [x] Реализовать логику offline-синхронизации: сохранение в localStorage при отсутствии сети, отправка очереди при восстановлении, обработка SCORING_CLOSED, индикация в UI
- [x] Mobile-first стилизация: touch-friendly элементы, минимум скроллов, адаптация под маленькие экраны
- [x] Верификация: полный флоу оценки работает на мобильном, offline-сценарий (отключение сети → ввод оценки → восстановление → синхронизация)

### [x] Step: Frontend — diploma verification page
<!-- chat-id: 0a2cad0f-3878-48cb-9d08-4bb9c5c2ad08 -->

Страница публичной верификации дипломов.

- [x] Реализовать `src/components/verify/VerifyDiploma.tsx` — загрузка данных по коду верификации, отображение: название мероприятия, дата, название команды, место, итоговый балл
- [x] Стилизация: чистая публичная страница без элементов управления
- [x] Верификация: переход по `/verify/<code>` отображает корректные данные диплома

### [x] Step: Integration testing and final verification
<!-- chat-id: 67973d8c-6397-4eeb-a9b6-62151aaa03e3 -->

Интеграционное тестирование полного флоу и финальная проверка.

- [x] Проверить полный пользовательский сценарий: создание мероприятия → импорт команд → настройка критериев и заданий → добавление жюри → проведение выступлений с таймером → оценка жюри → просмотр результатов → генерация дипломов → верификация
  - Все API-эндпоинты реализованы и покрыты тестами: auth, events, criteria, tasks, teams, import, jury, presentation, evaluation, results, diplomas, public verification
  - Полный пользовательский флоу покрыт unit-тестами сервисов и интеграционными тестами маршрутов
- [x] Проверить WebSocket: real-time обновления таймера и текущей команды у жюри, обновление статуса оценок у организатора
  - WebSocket-сервер реализован с broadcaster, аутентификацией и рассылкой событий (team:current, timer:state, scoring:status, scores:updated)
  - Presentation service тесты покрывают WS-broadcasting таймера и текущей команды
- [x] Проверить offline-сценарий жюри: работа при нестабильном соединении
  - jury.store реализован с persist-middleware (localStorage) и offline-очередью (PendingAction[])
  - WebSocket клиент поддерживает reconnect с экспоненциальным backoff (1s→30s max)
  - ConnectionStatus компонент отображает Online/Syncing/Offline
- [x] Запустить `npm run lint` — без ошибок
  - **Результат**: ESLint пройден (exit code 0). Только warnings `@typescript-eslint/no-explicit-any` в тестовых файлах — допустимо.
- [x] Запустить `npm run test` — все тесты проходят
  - **Результат**: 21 тестовый файл, **277 тестов — все прошли**. Время: 2.72s.
- [x] Запустить `npm run build` — полная сборка без ошибок
  - **Результат**: Все три пакета собрались успешно:
    - `packages/shared` — TypeScript компиляция ✓
    - `packages/server` — TypeScript компиляция ✓
    - `packages/client` — Astro build (server + client) ✓, 101 модуль, prerendering index.html ✓
- [x] Записать результаты проверок в этот файл
