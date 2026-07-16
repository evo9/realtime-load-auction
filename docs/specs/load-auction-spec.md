# Real-time Load Auction — техническое задание

> Портфолио-проект. Цель — продемонстрировать владение инфраструктурой и
> паттернами распределённых систем на стеке **NestJS (модульный монолит) +
> RabbitMQ + Redis**. Домен (аукцион по фрахту) выбран как средство: он делает
> RabbitMQ и Redis обязательными, а не декоративными.

---

## 1. Что этот проект доказывает

Аудитория проекта — инженеры, которые потратят на просмотр 5–10 минут: README →
диаграмма архитектуры → пара файлов. Поэтому проект оптимизирован не под «читать
код запоем», а под быстрый сигнал «человек умеет» + материал для рассказа на
собеседовании.

Конкретные навыки, которые проект показывает:

- Модульный монолит с чёткими границами модулей (без DDD-оверхеда).
- CQRS-lite: разделение команд и запросов без тяжёлых агрегатов. **Это про
  принцип (разделение read/write путей), а НЕ про библиотеку `@nestjs/cqrs`** —
  см. §4.1.
- **Outbox** — надёжная публикация событий без dual-write.
- **Saga (оркестрация)** с компенсациями — на закрытии лота и сеттлменте.
- **Идемпотентность** на двух уровнях: входящий API и потребители очередей.
- **Backpressure** — prefetch/QoS, ограниченная конкуррентность, DLX + retry.
- **Конкурентность на деньгах** — атомарный compare-and-set на Lua в Redis,
  оптимистичная блокировка в Postgres, стратегия reconciliation двух источников.
- Realtime-фанаут через Redis Pub/Sub на WebSocket с несколькими инстансами.

---

## 2. Скоуп MVP

**Облегчённый.** Две стороны рынка существуют в модели, но UI асимметричен.

| Сторона | Модель | Auth/роль | API | UI |
|---|---|---|---|---|
| Carrier (перевозчик) | да | да | полный | **полный, акцент на живые торги** |
| Shipper (грузоотправитель) | да | да | полный (`CreateLot` и т.д.) | **нет в MVP, только seed/генератор** |

Роль `shipper` закладывается сразу (модель + auth + write-путь создания лота),
чтобы оставить место для манёвра: добавить UI шиппера позже = только проводка,
без переделки бэкенда.

### Источник лотов
1. **Seed** — стартовый набор реалистичных грузов и несколько шипперов.
2. **Фоновый генератор** (scheduled job) — периодически создаёт синтетические
   лоты и эмулирует ставки ботов-перевозчиков, чтобы realtime-демо не выглядела
   мёртвой. Попутно это ещё один продюсер/консьюмер — работает на тему инфры.
3. *(Опционально, 2-я итерация)* модуль `ingestion` — импорт лотов из внешней
   фрахтовой биржи. Хороший повод показать идемпотентный консьюмер на приёме
   (внешний фид присылает дубли). В MVP не делаем.

### Вне скоупа MVP (явные non-goals)
- Реальные платежи (сеттлмент эмулируется: «резерв → подтверждение → инвойс»).
- UI шиппера, сложный профиль/KYC перевозчиков.
- Геопоиск/матчинг по маршрутам (листинг — простой фильтр).
- Мультивалютность, налоги, реальная тарификация.

---

## 3. Доменная модель и жизненный цикл лота

**Lot** (груз, выставленный на аукцион):
- `id`, `shipperId`
- маршрут: `origin`, `destination`
- груз: `equipmentType` (van/reefer/flatbed…), `weightKg`, `pickupWindow`
- цена: `reservePrice` (минимальная приемлемая), опц. `targetPrice`
- тайминги: `openAt`, `closeAt`, `antiSnipeWindowSec`
- состояние: `status`, `version` (оптимистичная блокировка)
- результат: `winningBidId`, `winningAmount`

**Bid** (ставка перевозчика): `id`, `lotId`, `carrierId`, `amount`, `createdAt`,
`idempotencyKey`.

> Аукцион **на понижение** (reverse auction): перевозчики предлагают цену
> перевозки, выигрывает наименьшая. Это естественно для фрахта. Для простоты
> в этом документе «выше/ниже» относится к *выгодности* ставки — реализационно
> сравнение идёт в нужную сторону (новая ставка лучше текущей).

### Жизненный цикл

```
draft ──> scheduled ──> open ──> closing ──> settled
                                    │
                                    └─> cancelled (нет ставок / отмена шиппера)
```

- `draft` → `scheduled`: шиппер создал лот с `openAt`/`closeAt`.
- `scheduled` → `open`: шедулер по `openAt` (Redis ZSET) шлёт `OpenLot`.
- `open` → `closing`: по `closeAt`; анти-снайп может продлить `closeAt`.
- `closing` → `settled`: saga сеттлмента отработала.
- → `cancelled`: компенсация / нет валидных ставок.

---

## 4. Архитектура: модульный монолит

Один разворачиваемый артефакт (HTTP + WebSocket + воркеры в одном процессе для
MVP; воркеры выносимы в отдельный процесс той же кодовой базы при желании).
Границы — по capability. Синхронные in-process вызовы между модулями допустимы;
всё, что является шагом workflow, может упасть или тормозит — идёт через RabbitMQ.

### Модули

| Модуль | Ответственность |
|---|---|
| `auction` | Жизненный цикл лота, источник истины по состоянию (оптимистичная блокировка). Команды `CreateLot`, `OpenLot`, `CloseLot`, `CancelLot`. |
| `bidding` | Приём и валидация ставок, горячий путь accept/reject, история ставок. |
| `settlement` | Saga закрытия: резерв → подтверждение победителя → инвойс → финализация, с компенсациями. |
| `notification` | Мультиканальный outbound (realtime-push + email-заглушка). Идемпотентный консьюмер. |
| `realtime` | WebSocket-gateway. Подписан на Redis Pub/Sub, фанаутит события клиентам лота. |
| `identity` | Пользователи, роли (`shipper` / `carrier`), JWT. Тонкий. |
| `listing` | Read-model для списка/поиска лотов (проекция из событий). |

### Платформенный слой (shared infrastructure)

| Пакет | Что инкапсулирует |
|---|---|
| `platform/outbox` | Таблица outbox + relay-публикатор в RabbitMQ. |
| `platform/idempotency` | Хранилище ключей идемпотентности (Redis) + интерсептор для API + хелпер дедупа для консьюмеров. |
| `platform/messaging` | Обёртка над RabbitMQ: топология, publisher, базовый consumer с retry/DLX и QoS. |
| `platform/redis` | Примитивы: `CasService` (Lua), `LockService` (Redlock-lite), `RateLimiter`, `PubSub`. |
| `platform/scheduler` | ZSET-планировщик отложенных команд (open/close лота). |
| `platform/persistence` | TypeORM datasource, базовый mapper-паттерн, транзакции. |

### 4.1 Слои внутри модуля (CQRS-lite, без тяжёлого DDD)

```
<module>/
├─ <module>.module.ts
├─ api/            # controllers + DTO (валидация на входе)
├─ application/    # commands/ queries/ + их handlers
├─ domain/         # типы, state-machine лота — без агрегатов/value-объектов
└─ infrastructure/ # репозитории, мапперы, адаптеры
```

> **CQRS здесь — это принцип, а не библиотека `@nestjs/cqrs`.** Имеется в виду
> разделение путей чтения и изменения, и ничего больше. Конкретно:
> - command/query-хендлеры — обычные `@Injectable`-сервисы; контроллер зовёт их
>   напрямую (или через тонкий фасад). **Никаких CommandBus / QueryBus** —
>   in-process шина в монолите даёт лишь индирекцию и теряет «go to definition».
> - query-путь не обязан повторять церемонию write-пути: query-хендлер бьёт прямо
>   в read-model/репозиторий и отдаёт DTO.
> - **EventBus и rxjs-саги из `@nestjs/cqrs` НЕ используются.** Событийный костяк
>   проекта — `outbox → RabbitMQ` (durable, переживает рестарт) и durable-saga с
>   персистентным состоянием (§7). In-memory EventBus был бы конкурирующим
>   недолговечным дублёром именно той инфраструктуры, которую проект и
>   демонстрирует — поэтому он сознательно исключён.

---

## 5. Карта «паттерн → где живёт»

| Паттерн | Модуль / пакет | Суть |
|---|---|---|
| Outbox | `platform/outbox` + `auction`, `bidding` | Событие пишется в таблицу `outbox` в той же транзакции, что и смена состояния. Relay публикует в RMQ. Нет потери событий и dual-write. |
| Saga (оркестрация) | `settlement` | Закрытие лота → цепочка команд через RMQ; состояние саги в БД; на каждый шаг — компенсация. |
| Idempotency (API) | `platform/idempotency` | `Idempotency-Key` → `SET NX` в Redis с TTL; повтор возвращает закешированный результат. |
| Idempotency (consumers) | `platform/idempotency` + все консьюмеры | RMQ = at-least-once → дедуп по `messageId` в Redis. Обязательно, иначе saga и нотификации двоятся. |
| Backpressure | `platform/messaging` | Prefetch (QoS) + bounded concurrency + DLX-retry поглощают всплески вместо падения. |
| Atomic high-bid (CAS) | `platform/redis` + `bidding` | Lua-скрипт: «принять, только если ставка лучше текущей И лот открыт» — атомарно. |
| Distributed lock | `platform/redis` + `auction`, `settlement` | `SET NX` + токен + Lua-release. Лот закрывается/сеттлится ровно один раз. |
| Scheduler (таймеры) | `platform/scheduler` + `auction` | ZSET score = `openAt`/`closeAt`; продление = атомарный апдейт score (анти-снайп). |
| Rate limit (анти-снайп) | `platform/redis` + `bidding` | Sliding-window на пару `carrier×lot`. |
| Realtime fan-out | `platform/redis` + `realtime` | Pub/Sub: событие от любого воркера → все WS-инстансы → клиенты лота. |

---

## 6. Горячий путь ставки

```
Carrier → POST /lots/:id/bids  (Idempotency-Key)
  1. platform/idempotency:  Redis SET NX по ключу  ── дубль? → вернуть кэш
  2. platform/redis CAS:    Lua compare-and-set     ── хуже/закрыт? → 409 Reject
  3. Postgres TX:           insert bid + lot.version (optimistic) + outbox row
  4. outbox relay:          publish bid.placed → RabbitMQ
  5. Redis Pub/Sub:         publish → realtime gateway → WS-клиенты лота
```

**Тонкое место (спросят на собесе):** что если шаг 3 упал после успешного CAS
(шаг 2)? Redis считает лучшей новую ставку, а в БД её нет. Решение: значение в
Redis трактуется как *кандидат*; источник истины — Postgres. На коммите кандидат
подтверждается, на rollback — откатывается, иначе лениво реконсилится при
следующей ставке/рестарте (Redis high-bid восстанавливается из БД). Эта деталь
отличает «прикрутил Redis» от «понимаю trade-offs».

---

## 7. Saga закрытия лота и сеттлмента

Триггер: событие `lot.closed` (от шедулера через `CloseLot`).

| Шаг | Действие | Компенсация |
|---|---|---|
| 1 | Взять distributed lock на лот | release lock (finally) |
| 2 | Определить победителя (лучшая валидная ставка из БД) | — |
| 3 | Reserve funds (эмуляция) | release funds |
| 4 | Сгенерировать инвойс | void invoice |
| 5 | Notify winner + shipper | — (нотификации идемпотентны) |
| 6 | `lot.status = settled`, записать результат | — |

Состояние саги (`saga_instances`: `lotId`, `step`, `status`, `payload`)
персистится. Падение шага после N ретраев → запуск компенсаций в обратном
порядке + `lot.status = cancelled`. Если валидных ставок нет → сразу `cancelled`.

---

## 8. Инфраструктура

### 8.1 RabbitMQ — топология

```
exchange  auction.events        type=topic   durable
  routing keys: lot.opened | lot.closing | lot.closed
                bid.placed | settlement.completed | settlement.failed

  ├─ queue notification.q   ← bid.placed, lot.opened, lot.closed
  ├─ queue settlement.q     ← lot.closed                (запускает saga)
  └─ queue listing.q        ← lot.opened, lot.closed    (read-model проекция)

exchange  settlement.commands   type=direct  durable     (шаги saga)
  └─ queue settlement.steps.q

retry / dead-letter:
exchange  auction.retry         type=topic               (TTL → возврат в main)
exchange  auction.dlx           type=topic
  └─ queue <name>.dlq           (после N ретраев)
```

- **QoS/prefetch** выставляется на каждом консьюмере (backpressure).
- **Retry** через `auction.retry` с message-TTL и экспонентой; после лимита → DLQ.
- Все консьюмеры **идемпотентны** (дедуп по `messageId`).

### 8.2 Redis — карта ключей

| Ключ | Тип | Назначение |
|---|---|---|
| `idem:{key}` | string (SET NX) | идемпотентность API, TTL |
| `msg:dedup:{messageId}` | string (SET NX) | идемпотентность консьюмеров |
| `lot:{id}:high` | hash {amount,carrierId,bidId} | текущая лучшая ставка (CAS) |
| `lot:{id}:status` | string | open/closing/closed (читает Lua CAS) |
| `lot:{id}:lock` | string (SET NX + token) | distributed lock на закрытие/сеттлмент |
| `auction:schedule:open` | zset (score=openAt) | планировщик открытия |
| `auction:schedule:close` | zset (score=closeAt) | планировщик закрытия + анти-снайп |
| `ratelimit:{carrier}:{lot}` | zset / counter | sliding-window анти-снайп |

### 8.3 Lua CAS (концепт)

```lua
-- KEYS[1]=lot:{id}:high  KEYS[2]=lot:{id}:status
-- ARGV[1]=amount  ARGV[2]=carrierId  ARGV[3]=bidId
if redis.call('GET', KEYS[2]) ~= 'open' then return {0, 'closed'} end
local cur = tonumber(redis.call('HGET', KEYS[1], 'amount'))
-- reverse auction: лучше = меньше; для обычного замените на >=
if cur and tonumber(ARGV[1]) >= cur then return {0, 'too_low'} end
redis.call('HSET', KEYS[1], 'amount', ARGV[1], 'carrierId', ARGV[2], 'bidId', ARGV[3])
return {1, 'accepted'}
```

---

## 9. Скелет репозитория

```
load-auction/
├─ docker-compose.yml            # postgres, rabbitmq(+management), redis
├─ README.md                     # история проекта + карта паттернов + диаграммы
├─ docs/
│  ├─ SPEC.md                    # этот документ
│  ├─ adr/                       # architecture decision records
│  └─ diagrams/                  # C4 / hot-path / saga
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ app.module.ts
│  │  │  ├─ modules/
│  │  │  │  ├─ auction/
│  │  │  │  ├─ bidding/
│  │  │  │  ├─ settlement/
│  │  │  │  ├─ notification/
│  │  │  │  ├─ realtime/
│  │  │  │  ├─ listing/
│  │  │  │  └─ identity/
│  │  │  └─ platform/
│  │  │     ├─ outbox/
│  │  │     ├─ idempotency/
│  │  │     ├─ messaging/
│  │  │     ├─ redis/
│  │  │     ├─ scheduler/
│  │  │     └─ persistence/
│  │  ├─ test/
│  │  └─ seed/                   # сидеры + генератор демо-активности
│  └─ web/                       # Next.js (акцент: страница живого лота)
└─ package.json
```

### 9.1 `app.module.ts`

```ts
@Module({
  imports: [
    // platform
    PersistenceModule, RedisModule, MessagingModule,
    OutboxModule, IdempotencyModule, SchedulerModule,
    // domain modules
    IdentityModule, AuctionModule, BiddingModule,
    SettlementModule, NotificationModule, RealtimeModule, ListingModule,
  ],
})
export class AppModule {}
```

### 9.2 `modules/bidding/bidding.module.ts`

```ts
@Module({
  imports: [RedisModule, OutboxModule, IdempotencyModule, PersistenceModule],
  controllers: [BiddingController],
  providers: [PlaceBidHandler, BidRepository, GetBidsHandler],
})
export class BiddingModule {}
```

### 9.3 Горячий путь — `application/commands/place-bid.handler.ts` (скелет)

```ts
@Injectable()
export class PlaceBidHandler {
  constructor(
    private readonly idem: IdempotencyService,   // platform/idempotency
    private readonly cas: CasService,            // platform/redis
    private readonly uow: UnitOfWork,            // platform/persistence (TX + outbox)
    private readonly bids: BidRepository,
  ) {}

  async execute(cmd: PlaceBidCommand): Promise<PlaceBidResult> {
    // 1. идемпотентность входа
    const cached = await this.idem.begin(cmd.idempotencyKey);
    if (cached) return cached.result;

    // 2. атомарный CAS в Redis (быстрый reject)
    const verdict = await this.cas.tryBeatHighBid(cmd.lotId, cmd.amount, cmd.carrierId, cmd.bidId);
    if (!verdict.accepted) {
      return this.idem.complete(cmd.idempotencyKey, reject(verdict.reason)); // 409
    }

    // 3. persist + outbox в одной транзакции
    const result = await this.uow.transaction(async (tx) => {
      const bid = await this.bids.insert(tx, cmd);
      await tx.lockLotForUpdate(cmd.lotId);            // optimistic version bump
      await tx.outbox.add('bid.placed', toEvent(bid)); // outbox row
      return accept(bid);
    });
    // на rollback CAS-кандидат будет реконсилен (см. §6)

    return this.idem.complete(cmd.idempotencyKey, result);
  }
}
```

### 9.4 `platform/redis/cas.service.ts` (скелет)

```ts
@Injectable()
export class CasService {
  private sha!: string; // загруженный Lua-скрипт
  async tryBeatHighBid(lotId: string, amount: number, carrierId: string, bidId: string) {
    const [ok, reason] = await this.redis.evalsha(this.sha,
      2, `lot:${lotId}:high`, `lot:${lotId}:status`,
      String(amount), carrierId, bidId);
    return { accepted: ok === 1, reason };
  }
}
```

### 9.5 `platform/outbox/outbox-relay.ts` (скелет)

```ts
@Injectable()
export class OutboxRelay {
  // poll-loop или Postgres LISTEN/NOTIFY
  async tick() {
    const batch = await this.repo.fetchUnpublished(100);
    for (const row of batch) {
      await this.publisher.publish('auction.events', row.routingKey, row.payload, {
        messageId: row.id,                 // → дедуп на стороне консьюмера
      });
      await this.repo.markPublished(row.id);
    }
  }
}
```

### 9.6 `platform/messaging/base.consumer.ts` (скелет)

```ts
export abstract class BaseConsumer {
  // prefetch/QoS задаётся при подписке (backpressure)
  protected async handle(msg: RmqMessage) {
    if (await this.dedup.seen(msg.messageId)) return this.ack(msg); // идемпотентность
    try {
      await this.process(msg);
      await this.dedup.mark(msg.messageId);
      this.ack(msg);
    } catch (e) {
      this.retryOrDlq(msg, e); // TTL-retry → после N попыток в DLQ
    }
  }
  abstract process(msg: RmqMessage): Promise<void>;
}
```

### 9.7 `platform/scheduler/zset-scheduler.ts` (скелет)

```ts
@Injectable()
export class ZSetScheduler {
  async schedule(setKey: string, dueAtMs: number, payload: string) {
    await this.redis.zadd(setKey, dueAtMs, payload);   // продление = повторный zadd
  }
  async tick(setKey: string, dispatch: (p: string) => Promise<void>) {
    const due = await this.redis.zrangebyscore(setKey, 0, Date.now());
    for (const p of due) { await dispatch(p); await this.redis.zrem(setKey, p); }
  }
}
```

---

## 10. API (ключевые эндпоинты MVP)

```
POST   /auth/login
GET    /lots                      # листинг (listing read-model), фильтры
GET    /lots/:id                  # детали + текущая лучшая ставка
POST   /lots/:id/bids             # ← горячий путь, требует Idempotency-Key
GET    /lots/:id/bids             # история ставок
GET    /me/bids                   # ставки текущего перевозчика

# shipper-path (есть в API, в MVP дёргается seed/генератором, без UI)
POST   /lots                      # CreateLot
POST   /lots/:id/cancel

WS     /realtime                  # подписка на канал лота: bid.placed, lot.closed, ...
```

---

## 11. Фронтенд (Next.js, акцент на перевозчика)

- **Список лотов** — SSR, быстрый first paint, простые фильтры.
- **Страница живого лота** — текущая лучшая ставка, обратный отсчёт, история,
  форма ставки; всё обновляется по WebSocket. Это витрина проекта.
- **Мои ставки** — дашборд перевозчика.
- **Ops-экран** (опц., но сильный сигнал) — состояния саг + содержимое DLQ.
- Auth: вход как `carrier`. `shipper`-UI — вне MVP.

---

## 12. Стек и инфраструктура запуска

- **Backend:** NestJS, TypeScript, TypeORM, Postgres.
- **Очереди/кэш:** RabbitMQ (+ management plugin), Redis.
- **Frontend:** Next.js (React), WebSocket-клиент.
- **Локально:** `docker-compose` — postgres + rabbitmq + redis; `make up && make seed`.
- **CI/CD:** lint + test + build (GitHub Actions); по желанию деплой демо.
- **Документация:** README с историей и картой паттернов, ADR, диаграммы
  (C4 + горячий путь + saga).

---

## 13. npm-модули

> Версии — ориентир на июнь 2026. NestJS остаётся на **11.x** (CommonJS, Jest):
> v12 (полный ESM, Vitest, oxlint) нацелен на Q3 2026 — для нового проекта пока
> рано. Точные патчи закрепит lockfile; ниже — выбор библиотек и обоснование
> неочевидных решений.

### Backend — runtime

| Пакет | Зачем |
|---|---|
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` | Ядро Nest 11. |
| `@nestjs/config` | Конфиг из env, валидация схемы конфига. |
| `@nestjs/jwt` | JWT-аутентификация. **Без** `passport`/`@nestjs/passport` — для одного JWT-стратегия passport избыточна; гард на `@nestjs/jwt` проще и прозрачнее. |
| `typeorm`, `@nestjs/typeorm`, `pg` | ORM + драйвер Postgres. Источник истины, миграции через TypeORM CLI. |
| `ioredis` | Клиент Redis. **Осознанный выбор вопреки тренду:** Redis официально рекомендует `node-redis` для новых проектов, но у нас тяжёлый Lua (CAS) — `ioredis.defineCommand` под это удобнее, плюс зрелые Pub/Sub и cluster. Решение задокументировать в ADR. |
| `amqplib` + `amqp-connection-manager` | RabbitMQ напрямую, с авто-реконнектом. **Намеренно не** `@nestjs/microservices` и не `@golevelup/nestjs-rabbitmq`: топологию (exchanges, DLX, retry-TTL, QoS) пишем руками — это и есть демонстрируемая часть проекта. Прятать её за декораторы — потерять смысл. |
| `@nestjs/websockets` + `@nestjs/platform-socket.io` | WebSocket-gateway для realtime. |
| `class-validator`, `class-transformer` | Валидация и трансформация DTO на входе API. |
| `nestjs-pino` (+ `pino`, `pino-http`) | Структурное логирование с корреляцией запросов. |
| `helmet`, `@nestjs/throttler` | Базовая защита заголовков + HTTP-rate-limit (отдельно от бизнес-rate-limit на ставки в Redis). |
| `uuid` | Идентификаторы (bid/lot/message id). |

> **Шедулер:** ZSET-планировщик (§9.7) — самописный поверх `ioredis`. Для
> запуска tick-цикла достаточно `setInterval` или `@nestjs/schedule` (cron).
> `@nestjs/schedule` берём только как тикер, не как механизм отложенных задач —
> сама очередь отложенного живёт в Redis ZSET, чтобы переживать рестарт.

> **Outbox, idempotency, locks, CAS, rate-limit, saga** — без отдельных
> библиотек. Это ядро того, что проект показывает; реализуем сами поверх
> `pg`/`ioredis`/`amqplib`. Готовый пакет здесь украл бы у проекта смысл.

### Backend — dev / test

| Пакет | Зачем |
|---|---|
| `typescript`, `ts-node`, `tsconfig-paths` | TS + алиасы `@src`. |
| `@nestjs/cli`, `@nestjs/testing` | Тулинг и тест-харнесс Nest. |
| `jest`, `ts-jest`, `supertest` | Unit + e2e (Nest 11 по умолчанию на Jest). |
| `@testcontainers/postgresql`, `@testcontainers/rabbitmq`, `@testcontainers/redis` | Интеграционные тесты на реальных Postgres/RMQ/Redis — сильный сигнал, что инфра-паттерны проверены, а не задекларированы. |
| `eslint`, `prettier`, `@typescript-eslint/*` | Линт/формат. |

### Frontend (`apps/web`)

| Пакет | Зачем |
|---|---|
| `next`, `react`, `react-dom` | Next.js: SSR списка лотов, страница живого лота. |
| `socket.io-client` | Подписка на канал лота (парность к серверному socket.io). |
| `@tanstack/react-query` | Серверное состояние, кэш, инвалидация на realtime-событиях. |
| `tailwindcss` | Утилитарные стили (по желанию — Angular здесь не берём, акцент realtime-витрины на React/Next). |

> Зависимости намеренно скромные: чем меньше «магических» библиотек поверх
> инфраструктуры, тем виднее, что паттерны реализованы руками — а это и есть
> предмет демонстрации.

---

## 14. Майлстоуны

1. **M1 — каркас.** docker-compose, app.module, платформенные пакеты-заглушки,
   `identity`, миграции. Поднимается, healthcheck зелёный.
2. **M2 — лоты.** `auction` + `CreateLot`/`OpenLot`/`CloseLot`, ZSET-шедулер,
   seed шипперов и лотов, `listing` read-model.
3. **M3 — горячий путь.** `bidding` + CAS + идемпотентность + outbox +
   `bid.placed`; базовый realtime через Pub/Sub.
4. **M4 — saga.** `settlement` с компенсациями, retry/DLX, ops-видимость.
5. **M5 — фронт.** Страница живого лота (WS), список, «мои ставки».
6. **M6 — оживление + полировка.** Генератор демо-активности, README,
   диаграммы, ADR, CI.

> Каждый майлстоун самодостаточен и демонстрируем — если запал кончится на M3,
> уже есть рассказываемая история (горячий путь + инфра).
