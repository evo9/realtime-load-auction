# Горячий путь ставки

§6 ТЗ, реализация — [`place-bid.handler.ts`](../../apps/api/src/modules/bidding/application/place-bid.handler.ts). Happy path — 5 шагов; отдельно показано «тонкое место» — что происходит, если транзакция шага 3 падает уже после успешного Redis CAS на шаге 2.

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
