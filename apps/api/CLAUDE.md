# CLAUDE.md — apps/api (бэкенд)

Бэкенд аукциона: NestJS 11, модульный монолит (HTTP + WebSocket + воркеры в одном процессе). Общие архитектурные принципы — в корневом `../../CLAUDE.md`; здесь только то, что касается api.

## Стек и текущее состояние
- **NestJS 11.x** (CommonJS, Jest) — на v12 не переходим (ESM/Vitest нацелены на Q3 2026, для проекта рано).
- TypeScript 5.7, `tsconfig` на `module: nodenext`, `strictNullChecks: true`.
- Пакетный менеджер — **pnpm**.
- `src/` пока содержит только бутстрап-слой (`main.ts`, `app.module.ts`, `config/`, `health/`). `modules/` и `platform/*`-пакеты появляются по задачам M1-03+.

## Команды (из `apps/api/`)
```
pnpm start:dev      # watch-режим
pnpm build          # nest build → dist/
pnpm test           # unit (jest, *.spec.ts рядом с кодом)
pnpm test:e2e       # e2e (test/, supertest)
pnpm lint           # eslint --fix
pnpm format         # prettier
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
- Domain-модули **не импортируют** внутренности `platform/*` — только публичные провайдеры модулей.
- Алиас `@src/*` настроен в `tsconfig.json`/jest (`moduleNameMapper`) для тайп-чекинга и тестов. Рантайм-резолвинг скомпилированного `dist` (`tsc-alias` или аналог) добавится, когда алиас реально понадобится в глубоко вложенном коде — пока все импорты плоские и обходятся относительными путями.

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
