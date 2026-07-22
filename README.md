# Real-time Load Auction

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

## Диаграммы и архитектурные решения

Ещё не готовы: C4 + горячий путь + saga лягут в `docs/diagrams/`, ключевые решения — в `docs/adr/` (следующие задачи майлстоуна M6). До тех пор — карта паттернов и `place-bid.handler.ts` выше плюс §4–§8 [спецификации](docs/specs/load-auction-spec.md) как текстовый эквивалент.

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
