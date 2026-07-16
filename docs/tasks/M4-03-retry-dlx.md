# M4-03 — Retry/DLX: экспоненциальный ретрай + dead-letter на всех консьюмерах

**Майлстоун:** M4 (saga)
**Зависимости:** M2-02, M4-02
**Оценка:** M (1 день)

## Цель
Довести до прод-готовности retry/dead-letter поведение (§8.1): TTL-retry с экспонентой через `auction.retry`, после лимита → `<name>.dlq`. Подтвердить backpressure.

## Объём работ
- Проверить/донастроить ретрай на consumer'ах: `notification.q`, `settlement.q`, `settlement.steps.q`, `listing.q`.
- `auction.retry` (TTL→возврат в main) с растущим TTL (экспонента) по числу попыток (header `x-attempts`/`x-death`).
- После N попыток → `auction.dlx` → `<name>.dlq`.
- Подтвердить QoS/prefetch + bounded concurrency на каждом consumer'е (backpressure, §5).
- Метрики/логи: счётчики ретраев, попадание в DLQ.

## Definition of Done
- Падающее сообщение проходит N ретраев с растущей задержкой, затем оседает в `<name>.dlq` (integration-тест).
- Всплеск сообщений ограничивается prefetch'ем, сервис не падает.
- В логах виден путь сообщения (attempt N → retry → dlq).
