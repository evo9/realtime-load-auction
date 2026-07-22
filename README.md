# Real-time Load Auction

**Backend**
&nbsp;
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat-square&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-24-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?style=flat-square&logo=socketdotio&logoColor=white)
![TypeORM](https://img.shields.io/badge/TypeORM-FE0803?style=flat-square)

**Frontend**
&nbsp;
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![TanStack Query](https://img.shields.io/badge/TanStack_Query-5-FF4154?style=flat-square&logo=reactquery&logoColor=white)

**Infra & Data**
&nbsp;
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-FF4438?style=flat-square&logo=redis&logoColor=white)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3-FF6600?style=flat-square&logo=rabbitmq&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)

**Tooling & Tests**
&nbsp;
![pnpm](https://img.shields.io/badge/pnpm-F69220?style=flat-square&logo=pnpm&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-30-C21325?style=flat-square&logo=jest&logoColor=white)
![Testcontainers](https://img.shields.io/badge/Testcontainers-291A3D?style=flat-square&logo=testcontainers&logoColor=white)
![ESLint](https://img.shields.io/badge/ESLint-9-4B32C3?style=flat-square&logo=eslint&logoColor=white)

Аукцион по фрахту **на понижение** (reverse auction — выигрывает наименьшая цена перевозки). Домен — средство, а не цель: он делает RabbitMQ и Redis **обязательными**, а не декоративными — есть реальные деньги на кону (конкурентные ставки), реальный таймер закрытия и реальная необходимость надёжно доставить событие. Стек — **NestJS (модульный монолит) + RabbitMQ + Redis + Postgres**, фронт — Next.js.

Это портфолио-проект. Если у вас 5–10 минут — этот README, потом пара файлов из карты паттернов ниже. Полное ТЗ — [`docs/specs/load-auction-spec.md`](docs/specs/load-auction-spec.md), разбивка на задачи с DoD — [`docs/tasks/INDEX.md`](docs/tasks/INDEX.md), журнал того, что реально сделано и чем проверено — [`docs/worklog.md`](docs/worklog.md).

## Что этот проект доказывает

- **Модульный монолит** с чёткими границами модулей, без DDD-оверхеда (агрегатов/value-объектов нет — домен лота — это типы + явная state-machine).
- **CQRS-lite как принцип, не библиотека** — разделение read/write путей без `@nestjs/cqrs`: хендлеры — обычные `@Injectable`, контроллер зовёт их напрямую.
- **Outbox** — надёжная публикация событий без dual-write.
- **Saga (оркестрация)** с компенсациями на закрытии лота и сеттлменте.
- **Идемпотентность на двух уровнях** — входящий API (`Idempotency-Key`) и консьюмеры очередей (дедуп по `messageId`).
- **Backpressure** — prefetch/QoS, ограниченная конкуррентность, DLX + экспоненциальный retry.
- **Конкурентность на деньгах** — атомарный compare-and-set на Lua в Redis, оптимистичная блокировка в Postgres, явная стратегия reconciliation двух источников истины.
- **Realtime-фанаут** — Redis Pub/Sub → WebSocket, независимо от того, какой инстанс принял событие.

Все паттерны написаны руками — `@nestjs/cqrs`, `@nestjs/microservices`, `@golevelup/*`, `redlock`, `bullmq`, готовые outbox/saga-библиотеки намеренно не использовались: сама инфраструктура — предмет демонстрации.

## Карта «паттерн → где живёт»

| Паттерн | Код | Суть |
|---|---|---|
| Outbox | [`platform/outbox/outbox.service.ts`](apps/api/src/platform/outbox/outbox.service.ts), [`outbox.relay.ts`](apps/api/src/platform/outbox/outbox.relay.ts) | Событие пишется в таблицу `outbox` в той же транзакции, что и смена состояния. Relay публикует в RMQ. Нет потери событий и dual-write. |
| Saga (оркестрация) | [`settlement/domain/saga.ts`](apps/api/src/modules/settlement/domain/saga.ts), [`settlement-step.consumer.ts`](apps/api/src/modules/settlement/application/settlement-step.consumer.ts) | Закрытие лота → цепочка команд через RMQ; состояние саги в Postgres; на каждый шаг — компенсация в обратном порядке. |
| Idempotency (API) | [`idempotency/idempotency.service.ts`](apps/api/src/platform/idempotency/idempotency.service.ts), [`require-idempotency-key.guard.ts`](apps/api/src/platform/idempotency/require-idempotency-key.guard.ts) | `Idempotency-Key` → `SET NX` в Redis с TTL; повтор возвращает закэшированный результат вместо повторной вставки. |
| Idempotency (consumers) | [`messaging/base.consumer.ts`](apps/api/src/platform/messaging/base.consumer.ts), [`dedup.port.ts`](apps/api/src/platform/messaging/dedup.port.ts) | RMQ = at-least-once → дедуп по `messageId` в Redis на каждом консьюмере. Без этого saga и нотификации двоятся. |
| Backpressure + retry/DLX | [`messaging/base.consumer.ts`](apps/api/src/platform/messaging/base.consumer.ts), [`retry-backoff.ts`](apps/api/src/platform/messaging/retry-backoff.ts), [`topology.ts`](apps/api/src/platform/messaging/topology.ts) | Prefetch (QoS) + bounded concurrency + экспоненциальный retry через `auction.retry` → после лимита в `<name>.dlq`. |
| Atomic high-bid (Lua CAS) | [`redis/cas.service.ts`](apps/api/src/platform/redis/cas.service.ts), [`lua-scripts.ts`](apps/api/src/platform/redis/lua-scripts.ts) | «Принять ставку, только если она лучше текущей И лот открыт» — атомарно, одним Lua-скриптом. |
| Distributed lock | [`redis/lock.service.ts`](apps/api/src/platform/redis/lock.service.ts) | `SET NX` + токен + Lua-release. Лот закрывается и сеттлится ровно один раз. |
| Scheduler (таймеры) | [`scheduler/zset-scheduler.ts`](apps/api/src/platform/scheduler/zset-scheduler.ts), [`scheduler.ticker.ts`](apps/api/src/platform/scheduler/scheduler.ticker.ts) | ZSET score = `openAt`/`closeAt`, переживает рестарт. Анти-снайп-продление — атомарный апдейт score. |
| Rate limit | [`redis/rate-limiter.ts`](apps/api/src/platform/redis/rate-limiter.ts) | Sliding-window на пару `carrier×lot` — режет всплеск ставок одного перевозчика. |
| Realtime fan-out | [`realtime/api/realtime.gateway.ts`](apps/api/src/modules/realtime/api/realtime.gateway.ts), [`realtime-bridge.consumer.ts`](apps/api/src/modules/realtime/infrastructure/realtime-bridge.consumer.ts) | Redis Pub/Sub: событие от любого воркера долетает до всех WS-инстансов и клиентов, подписанных на канал лота. |
| Демо-генератор | [`modules/demo/`](apps/api/src/modules/demo/) | Фоновый job создаёт синтетические лоты и гоняет бот-ставки через тот же горячий путь — ещё один продюсер/консьюмер и живая демонстрация анти-снайпа. |

## Горячий путь ставки

```
Carrier → POST /lots/:id/bids  (Idempotency-Key)
  1. idempotency:  Redis SET NX по ключу        — дубль? → вернуть кэш
  2. Lua CAS:       compare-and-set в Redis      — хуже/закрыт? → 409
  3. Postgres TX:   insert bid + lot.version (optimistic) + outbox row
  4. outbox relay:  publish bid.placed → RabbitMQ
  5. Redis Pub/Sub: publish → realtime gateway → WS-клиенты лота
```

Реализация — [`bidding/application/place-bid.handler.ts`](apps/api/src/modules/bidding/application/place-bid.handler.ts). Тонкое место: что если шаг 3 упал после успешного CAS? Redis уже считает новую ставку лучшей, а в Postgres её нет. Redis трактуется как *кандидат*; источником истины остаётся Postgres — на неудаче кандидат реконсилится обратно к тому, что реально лежит в БД (см. `reconcileIfCurrent` в `cas.service.ts`).

## Быстрый старт

```bash
make setup   # .env из примеров (существующие не трогает) + зависимости
make up      # Postgres, RabbitMQ (+management), Redis — до прохождения healthcheck
make seed    # миграции + демо-пользователи и лоты
pnpm dev     # api (:3000) + web (:3001)
```

Проверить, что инфра жива:

- RabbitMQ management UI — http://localhost:15672 (логин/пароль из `.env.example`)
- Postgres — `psql "postgresql://auction:auction@localhost:5432/auction"`
- Redis — `redis-cli -h localhost -p 6379 ping` → `PONG`

Другие команды: `make down`, `make logs`, `make ps`.

### Демо-сценарий (2 минуты)

1. Откройте http://localhost:3001, залогиньтесь как `carrier1@example.com` (пароль — `demo12345` из seed). Список лотов — SSR, живые данные из `GET /lots`.
2. Откройте лот со статусом `open` в двух вкладках/браузерах, во второй войдите как `carrier2@example.com`.
3. Поставьте ставку в одной вкладке — во второй она появится мгновенно по WebSocket, без рефреша (реверс-аукцион: выигрывает **меньшая** сумма).
4. Поставьте ставку в последние секунды перед закрытием — увидите анти-снайп: `closeAt` продлевается на витрине в реальном времени.
5. Не хотите бидать руками — включите `DEMO_ENABLED=true` в `apps/api/.env` и перезапустите `pnpm dev`: боты сами создают лоты и ставки, включая всплески к закрытию (см. карту паттернов выше).

Опционально: `/ops` (роль `admin`, seed-пользователь `ops@example.com`) — состояния саг закрытия и содержимое dead-letter очередей.

## Скоуп и non-goals

MVP облегчённый: у **carrier** (перевозчика) полный UI с акцентом на живые торги; у **shipper** (грузоотправителя) есть модель, auth и write-API (`CreateLot` и т.д.), но UI — только seed и фоновый генератор, роль заложена на будущее без переделки бэкенда.

Явно вне скоупа:
- Реальные платежи — сеттлмент эмулируется («резерв → подтверждение → инвойс»).
- UI шиппера, сложный профиль/KYC перевозчиков.
- Геопоиск/матчинг по маршрутам — листинг — простой фильтр.
- Мультивалютность, налоги, реальная тарификация.

## Диаграммы

### C4 — контекст и контейнеры

`api` — единый процесс NestJS (HTTP + WebSocket + фоновые воркеры), не микросервисы. Исходник — [`docs/diagrams/c4-context-container.md`](docs/diagrams/c4-context-container.md).

```mermaid
flowchart TD
    Carrier(["Carrier<br/>(перевозчик, браузер)"])
    Shipper(["Shipper<br/>(грузоотправитель)<br/>только API — нет UI в MVP"])

    subgraph system["Real-time Load Auction"]
        direction TB
        Web["web<br/>(Next.js)<br/>SSR-листинг + live-лот на WS"]
        Api["api<br/>(NestJS монолит)<br/>HTTP + WebSocket + воркеры"]
        Postgres[("Postgres<br/>источник истины: лоты, ставки, saga")]
        RabbitMQ[("RabbitMQ<br/>outbox-события, команды саги, retry/DLX")]
        Redis[("Redis<br/>CAS high-bid, idempotency, lock,<br/>ZSET-шедулер, rate-limit, Pub/Sub")]
    end

    Carrier -- "HTTPS + WS" --> Web
    Web -- "REST (JWT) + WS /realtime" --> Api
    Shipper -- "REST (JWT)<br/>в MVP — только seed / демо-генератор" --> Api

    Api -- "TypeORM, транзакции" --> Postgres
    Api -- "publish/consume, топология в §8.1" --> RabbitMQ
    Api -- "Lua CAS, locks, Pub/Sub" --> Redis
```

### Горячий путь ставки

5 шагов §6 + «тонкое место» (reconciliation после падения TX). Исходник — [`docs/diagrams/hot-path-bid.md`](docs/diagrams/hot-path-bid.md).

```mermaid
sequenceDiagram
    actor Carrier
    participant API as PlaceBidHandler
    participant Idem as Redis (idempotency)
    participant CAS as Redis (Lua CAS)
    participant PG as Postgres
    participant Relay as Outbox relay
    participant MQ as RabbitMQ
    participant WS as Realtime gateway (WS)

    Carrier->>API: POST /lots/:id/bids (Idempotency-Key)
    API->>Idem: 1. SET NX idem:{key}
    Idem-->>API: новый ключ (не дубль)
    API->>CAS: 2. Lua CAS — лучше текущей И лот open?
    CAS-->>API: accepted, lot:{id}:high = кандидат
    API->>PG: 3. TX: insert bid + bump lot.version + outbox row
    PG-->>API: commit ok
    API-->>Carrier: 201 Accepted

    Relay->>PG: poll outbox
    Relay->>MQ: 4. publish bid.placed
    MQ->>WS: consume (listing.q / notification.q / realtime)
    WS-->>Carrier: 5. WS bid.placed → все клиенты лота

    rect rgba(220,50,50,0.12)
        Note over API,PG: тонкое место — TX шага 3 падает ПОСЛЕ успешного CAS
        API->>PG: TX: insert bid ... — ошибка/rollback
        API->>PG: findCurrentBest(lotId)
        API->>CAS: reconcileIfCurrent(fence: ожидаемый bidId)
        Note right of CAS: Redis — кандидат, Postgres — источник истины.<br/>Если конкурентная ставка уже перезаписала кандидата,<br/>реконсиляция не трогает её (fenced по bidId).
    end
```

### Saga закрытия лота и сеттлмента

6 шагов §7 + компенсации в обратном порядке (начиная с упавшего шага). Исходник — [`docs/diagrams/settlement-saga.md`](docs/diagrams/settlement-saga.md).

```mermaid
flowchart TD
    Trigger(["lot.closed"]) --> S1["1. Lock<br/>distributed lock на лот"]
    S1 -->|ok| S2["2. Winner<br/>лучшая валидная ставка из БД"]
    S2 -->|ok| S3["3. Reserve<br/>резерв средств (эмуляция)"]
    S3 -->|ok| S4["4. Invoice<br/>сгенерировать инвойс"]
    S4 -->|ok| S5["5. Notify<br/>winner + shipper"]
    S5 -->|ok| S6["6. Settle<br/>lot.status = settled"]
    S6 --> Done(["settlement.completed"])

    S1 -.->|N ретраев исчерпаны| C1["Compensate 1: release lock"]
    S2 -.->|нет валидных ставок<br/>или N ретраев| C2["Compensate 2: — (no-op)"]
    S3 -.->|N ретраев исчерпаны| C3["Compensate 3: release funds"]
    S4 -.->|N ретраев исчерпаны| C4["Compensate 4: void invoice"]
    S5 -.->|N ретраев исчерпаны| C5["Compensate 5: — (no-op)"]
    S6 -.->|N ретраев исчерпаны| C6["Compensate 6: — (no-op)"]

    C6 --> C5 --> C4 --> C3 --> C2 --> C1
    C1 --> Failed(["settlement.failed<br/>lot.status = cancelled"])

    classDef compensate fill:#5a1f1f,stroke:#e06666,color:#fff
    class C1,C2,C3,C4,C5,C6 compensate
    classDef terminal fill:#1f3d1f,stroke:#66bb6a,color:#fff
    class Done terminal
    classDef failterm fill:#3d1f1f,stroke:#e06666,color:#fff
    class Failed failterm
```

## Архитектурные решения (ADR)

Почему выбрана конкретная библиотека/подход там, где это неочевидно — не «что паттерн делает» (это карта паттернов выше), а «почему так, а не иначе». Полный список — [`docs/adr/`](docs/adr/README.md):

- [`ioredis` вместо `node-redis`](docs/adr/0001-ioredis-over-node-redis.md)
- [`amqplib` вместо `@nestjs/microservices`/`@golevelup`](docs/adr/0002-amqplib-over-nestjs-microservices.md)
- [CQRS-lite без `@nestjs/cqrs`](docs/adr/0003-cqrs-lite-without-nestjs-cqrs.md)
- [Outbox + durable-saga вместо dual-write и in-memory EventBus](docs/adr/0004-outbox-and-durable-saga-over-inmemory-eventbus.md)
- [Redis CAS как кандидат + reconciliation с Postgres](docs/adr/0005-redis-cas-candidate-with-reconciliation.md)
- [NestJS 11.x, не 12](docs/adr/0006-nest-11-not-12.md)

## Структура репозитория

```
apps/
  api/   — NestJS-бэкенд: HTTP + WebSocket + воркеры в одном процессе
  web/   — Next.js-фронтенд (акцент на carrier)
docs/
  specs/load-auction-spec.md   — ТЗ, источник истины по требованиям
  tasks/                        — задачи по майлстоунам + статус в INDEX.md
  worklog.md                    — что сделано и чем проверено
```

Архитектурные принципы, слои модуля и правила зависимостей — в корневом [`CLAUDE.md`](CLAUDE.md); специфика бэка/фронта — в [`apps/api/CLAUDE.md`](apps/api/CLAUDE.md) и [`apps/web/CLAUDE.md`](apps/web/CLAUDE.md).

## Команды разработки

Корневой `package.json` — тонкий раннер (не pnpm workspace: у `api`/`web` раздельные lockfile и `node_modules`).

| Команда | Что делает |
|---|---|
| `pnpm dev` | api (watch) + web (dev) параллельно |
| `pnpm build` | прод-сборка обоих приложений |
| `pnpm lint` | eslint по обоим приложениям |
| `pnpm test` | unit-тесты api (jest) |
| `pnpm test:e2e` | e2e api (supertest, реальная инфра) |
| `pnpm -C apps/api test:integration` | инфра-паттерны на реальных Postgres/RabbitMQ/Redis (testcontainers) |
