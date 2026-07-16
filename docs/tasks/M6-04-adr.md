# M6-04 — ADR: ключевые архитектурные решения

**Майлстоун:** M6 (полировка)
**Зависимости:** соответствующие решения приняты по ходу M1–M4
**Оценка:** S (0.5 дня)

## Цель
Architecture Decision Records (§9, §13) — фиксируют неочевидный выбор, дают материал для собеса.

## Объём работ
ADR в `docs/adr/` (по одному файлу, формат «контекст → решение → последствия»):
- `ioredis` вместо `node-redis` (тяжёлый Lua/CAS, `defineCommand`, Pub/Sub — §13).
- `amqplib`+`amqp-connection-manager` вместо `@nestjs/microservices`/`golevelup` (топология руками — §13).
- CQRS-lite без `@nestjs/cqrs` (нет CommandBus/EventBus/rxjs-саг — §4.1).
- Outbox вместо dual-write; durable-saga вместо in-memory EventBus (§4.1, §5).
- Reverse-auction CAS как кандидат + reconciliation (Postgres — источник истины, §6).
- Nest 11.x, не 12 (§13).

## Definition of Done
- Каждый значимый «почему именно так» из §4.1/§6/§13 покрыт коротким ADR.
- ADR слинкованы из README.
