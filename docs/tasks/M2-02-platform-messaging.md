# M2-02 — platform/messaging: топология RabbitMQ, publisher, base consumer, QoS, retry/DLX

**Майлстоун:** M2 (лоты) — платформенный задел
**Зависимости:** M1-04
**Оценка:** L (1.5–2 дня)

## Цель
Ручная обёртка над `amqplib` + `amqp-connection-manager` (см. §13): объявление топологии, надёжный publisher, базовый consumer с prefetch/QoS, retry через TTL и DLX. Это демонстрируемое ядро — пишем руками, без `@nestjs/microservices`.

## Объём работ
- Подключение с авто-реконнектом (`amqp-connection-manager`).
- Декларация топологии (§8.1): exchange `auction.events` (topic, durable); очереди `notification.q`, `settlement.q`, `listing.q` с биндингами; exchange `settlement.commands` (direct) + `settlement.steps.q`; `auction.retry` (TTL→main) и `auction.dlx` + `<name>.dlq`.
- `Publisher`: publish с `messageId` (для дедупа консьюмеров), persistent, confirm-channel.
- `BaseConsumer` (§9.6): prefetch/QoS при подписке, шаблон `handle` (dedup-хук под M3-01 → process → ack), `retryOrDlq` (TTL-retry с экспонентой → после N в DLQ).
- Конфиг: prefetch, retry-лимит, базовый TTL — из env.

## Definition of Done
- При старте топология декларируется идемпотентно (повторный старт не падает).
- Publish→consume работает end-to-end (integration-тест, testcontainers RabbitMQ).
- Сообщение, кидающее ошибку N раз, уходит в `<name>.dlq`; успешное — ack без ретраев.
- QoS/prefetch реально ограничивает in-flight (проверка в тесте).
