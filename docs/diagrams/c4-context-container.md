# C4 — контекст и контейнеры

Уровень 1–2: кто пользуется системой и из каких контейнеров она состоит. `api` — единый процесс NestJS (HTTP + WebSocket + фоновые воркеры: outbox relay, scheduler ticker, RMQ-консьюмеры) — модульный монолит, не микросервисы.

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
