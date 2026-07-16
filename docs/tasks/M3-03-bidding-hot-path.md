# M3-03 — bidding: горячий путь PlaceBid (idem → CAS → TX+outbox)

**Майлстоун:** M3 (горячий путь) — витрина инфры
**Зависимости:** M3-01, M3-02, M2-03
**Оценка:** L (1.5 дня)

## Цель
Горячий путь приёма ставки (§6, §9.3): идемпотентность входа → атомарный CAS → persist+outbox в одной TX → событие `bid.placed`. Это центральный сигнал проекта.

## Объём работ
- `bidding.module.ts` (§9.2): импорт Redis/Outbox/Idempotency/Persistence.
- Сущность `Bid` (§3: id, lotId, carrierId, amount, createdAt, idempotencyKey) + миграция.
- `PlaceBidHandler` (§9.3):
  1. `idem.begin` (дубль → кэш);
  2. `cas.tryBeatHighBid` (reject → 409 с reason);
  3. UoW: insert bid + bump `lot.version` (optimistic) + `outbox.add('bid.placed')`;
  4. `idem.complete`.
- Rate-limit анти-снайп (`RateLimiter` из M2-01) на пару `carrier×lot`.
- `POST /lots/:id/bids` (carrier-роль, требует `Idempotency-Key`), коды 201/409/422.
- Связка reconciliation из M3-02 на rollback.

## Definition of Done
- Валидная лучшая ставка → 201, `bid.placed` в RMQ, `lot:{id}:high` обновлён.
- Хуже/закрыт → 409 без записи в БД.
- Повтор с тем же `Idempotency-Key` → тот же ответ, без второй вставки.
- Конкурентные ставки: ровно одна признаётся лучшей; БД и Redis согласованы (integration-тест на testcontainers).
- Rate-limit режет всплеск ставок одного carrier по лоту.
