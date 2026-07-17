# CLAUDE.md — apps/api (бэкенд)

Бэкенд аукциона: NestJS 11, модульный монолит (HTTP + WebSocket + воркеры в одном процессе). Общие архитектурные принципы — в корневом `../../CLAUDE.md`; здесь только то, что касается api.

## Стек и текущее состояние
- **NestJS 11.x** (CommonJS, Jest) — на v12 не переходим (ESM/Vitest нацелены на Q3 2026, для проекта рано).
- TypeScript 5.7, `tsconfig` на `module: nodenext`, `strictNullChecks: true`.
- Пакетный менеджер — **pnpm**.
- `src/` содержит бутстрап-слой (`main.ts`, `app.module.ts`, `config/`, `health/`), все `platform/*`-заглушки/пакеты и первый доменный модуль — `modules/identity`. Остальные `modules/` появляются с M2.

## Команды (из `apps/api/`)
```
pnpm start:dev      # watch-режим
pnpm build          # nest build → dist/
pnpm test           # unit (jest, *.spec.ts рядом с кодом)
pnpm test:e2e       # e2e (test/, supertest)
pnpm lint           # eslint --fix
pnpm format         # prettier
pnpm test:integration        # testcontainers-тесты инфра-паттернов (*.integration-spec.ts)
pnpm migration:generate/run/revert   # TypeORM CLI (typeorm-ts-node-commonjs)
```

## Целевая структура (§4.1, §9 ТЗ)
```
src/
  main.ts, app.module.ts
  modules/
    auction/        # жизненный цикл лота, источник истины (optimistic lock)
    bidding/        # приём/валидация ставок, горячий путь accept/reject
    settlement/     # saga закрытия: резерв→инвойс→финализация + компенсации
    notification/   # идемпотентный outbound (realtime-push + email-stub)
    realtime/       # WS-gateway, подписан на Redis Pub/Sub
    identity/       # пользователи, роли (shipper/carrier), JWT
    listing/        # read-model списка лотов (проекция из событий)
  platform/
    outbox/ idempotency/ messaging/ redis/ scheduler/ persistence/
```
Слои внутри модуля: `api/` (контроллеры + DTO) · `application/` (commands/queries + хендлеры) · `domain/` (типы, state-machine — без агрегатов) · `infrastructure/` (репозитории, мапперы, адаптеры).

## Конвенции
- **Хендлеры — обычные `@Injectable`-сервисы.** Контроллер зовёт их напрямую (или через тонкий фасад). Никаких `CommandBus`/`QueryBus`/`EventBus` (см. корневой CLAUDE.md).
- Query-путь не повторяет церемонию write-пути: query-хендлер бьёт прямо в read-model/репозиторий и отдаёт DTO.
- Валидация входа — `class-validator`/`class-transformer` на DTO в `api/`.
- **Зависимость идёт `modules/*` → `platform/*` и никогда обратно.** `platform/*` не знает слова «лот»: любой импорт из `@src/modules/*` внутри `platform/` — ошибка линта. Если платформе понадобилось что-то доменное, разверни стрелку портом (образец — `OutboxPort` в `platform/persistence`).
- Domain-модули **не импортируют** внутренности `platform/*` — только публичные провайдеры модулей (линтом пока не зажато).
- **Импорты — через алиас `@src/*`.** Относительный путь допустим только до соседа по той же папке (`./unit-of-work`, `./env.schema`). Всё, что лежит вне текущей директории, импортируется алиасом: `@src/config/app-config.service`, а не `../../config/app-config.service` и не `./config/app-config.service`. `../` в импортах не используем вообще — при переносе файла такой путь молча меняет смысл. Алиас объявлен в `tsconfig.json` (`paths`) и продублирован в jest (`moduleNameMapper` в `package.json` и `test/jest-e2e.json`) — при добавлении нового алиаса правь все три места. Рантайм-резолвинг не нужен: `nest build` переписывает алиасы в относительные пути на компиляции, в `dist` их не остаётся (`tsc-alias` не требуется).
- **Репозитории — обычные `@Injectable`, write-методы принимают `tx: TransactionContext` первым аргументом** (не хранят `EntityManager` на весь жизненный цикл). `BaseRepository<Entity>` (`platform/persistence/base.repository.ts`) даёт `protected repo(tx)` для записи и `protected read()` (напрямую через `DataSource`, без транзакции) для чтения — канонический способ читать вне query-хендлеров, повторяющих write-церемонию. Конкретные репозитории наследуют и добавляют доменные методы (см. `modules/identity/infrastructure/user.repository.ts`).
- **Оптимистичная блокировка — `@VersionColumn()`** на write-сущностях (Lot и т.п., с M2-05). Пессимистичный лок на чтение перед изменением — `tx.lockForUpdate(Entity, id)` (`platform/persistence/transaction-context.ts`), generic уже сейчас; доменный `lockLotForUpdate` в M2-05 — тонкая обёртка над ним.
- **`tx.outbox.add(manager, eventType, payload)` — контракт до M2-03.** Без реализации `platform/outbox` бросает понятную ошибку («not configured yet»); `UnitOfWork` инжектит `OUTBOX_PORT` опционально, `platform/persistence` не зависит от `platform/outbox`.
- **Auth без passport** (`modules/identity`): `JwtAuthGuard`/`RolesGuard` — ручные `CanActivate` на `@nestjs/jwt`, без `@nestjs/passport`. Пароли — `@node-rs/argon2` (Argon2id; prebuilt-бинарники, без трения с `pnpm approve-builds`, в отличие от `bcrypt`/`argon2` на node-gyp). JWT-конфиг — секция `AppConfigService.jwt` (`JWT_SECRET` обязателен, без дефолта). `GET /me` возвращает JWT-payload как есть, без похода в БД — это guard-smoke-test, а не профильная ручка. `IdentityModule` экспортирует `JwtAuthGuard`/`RolesGuard`/`@Roles()` — будущие модули импортируют модуль, а не копируют guards.

## Библиотеки — осознанный выбор (не заменять)
- `ioredis` (не node-redis): тяжёлый Lua/CAS через `defineCommand`, зрелый Pub/Sub.
- `amqplib` + `amqp-connection-manager` (не `@nestjs/microservices`): топологию (exchanges, DLX, retry-TTL, QoS) пишем руками — это демонстрируемая часть.
- `@nestjs/jwt` без `passport`/`@nestjs/passport`: для одной JWT-стратегии passport избыточен.
- `typeorm` + `pg`: источник истины, миграции через TypeORM CLI.
- `@nestjs/websockets` + `socket.io`, `nestjs-pino`, `helmet`, `@nestjs/throttler`.
- **Outbox, idempotency, locks, CAS, rate-limit, saga — без отдельных библиотек.** Это ядро демонстрации, реализуем сами поверх `pg`/`ioredis`/`amqplib`.
- Тикер шедулера — `@nestjs/schedule`/`setInterval`; **сама очередь отложенного — Redis ZSET** (переживает рестарт), а не in-memory-таймеры.

## Горячий путь ставки (§6 — критично)
`POST /lots/:id/bids` (требует `Idempotency-Key`): идемпотентность входа → Lua CAS (быстрый reject) → Postgres TX (insert bid + bump `lot.version` + outbox row) → relay публикует `bid.placed` → Redis Pub/Sub → WS. Redis high-bid — *кандидат*; на rollback реконсилится из БД (Postgres — источник истины).

## Тесты
- Unit — рядом с кодом (`*.spec.ts`), `rootDir: src`.
- Интеграционные — на реальных Postgres/RMQ/Redis через `@testcontainers/*`. Инфра-паттерны (outbox, CAS, saga, retry/DLX) должны быть проверены на реальной инфре, а не задекларированы.
