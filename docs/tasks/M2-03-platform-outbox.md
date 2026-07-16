# M2-03 — platform/outbox: таблица + relay-публикатор

**Майлстоун:** M2 (лоты) — платформенный задел
**Зависимости:** M1-03, M2-02
**Оценка:** M (1 день)

## Цель
Надёжная публикация событий без dual-write (§5): событие пишется в таблицу `outbox` в той же TX, что и смена состояния; relay вычитывает и публикует в RMQ.

## Объём работ
- Таблица `outbox` (`id` (uuid, → messageId), `routingKey`, `payload` jsonb, `createdAt`, `publishedAt` nullable, `attempts`) + миграция.
- API записи в рамках UoW: `tx.outbox.add(routingKey, payload)` (контракт из M1-03).
- `OutboxRelay` (§9.5): poll-loop (или LISTEN/NOTIFY) — `fetchUnpublished(batch)` → publish в `auction.events` с `messageId=row.id` → `markPublished`.
- Тикер relay (`@nestjs/schedule`/`setInterval`), безопасный к параллельному запуску (SKIP LOCKED / advisory lock).

## Definition of Done
- Запись в outbox и доменную таблицу атомарна (rollback → нет события).
- Relay публикует ровно один раз помеченные строки; `publishedAt` проставляется.
- Падение между publish и markPublished → повторная публикация (at-least-once), дедуп на консьюмере (M3-01) гасит дубль. Покрыто integration-тестом.
