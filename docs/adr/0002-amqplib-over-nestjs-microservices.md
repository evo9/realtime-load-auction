# 0002 — `amqplib` + `amqp-connection-manager` вместо `@nestjs/microservices`/`@golevelup/nestjs-rabbitmq`

**Статус:** Accepted

## Контекст

Проект — демонстрация владения RabbitMQ как инфраструктурой: топология exchange'ей, routing keys, retry с TTL-очередями, dead-letter, QoS/prefetch (§8.1 ТЗ). `@nestjs/microservices` и `@golevelup/nestjs-rabbitmq` дают декларативный слой поверх этой топологии — удобно для прод-кода, но прячет именно то, что здесь нужно показать.

## Решение

RabbitMQ-клиент — `amqplib` с авто-реконнектом через `amqp-connection-manager`. Топология (exchanges/queues/routing keys/retry/DLX) объявляется руками в [`topology.ts`](../../apps/api/src/platform/messaging/topology.ts); базовый консьюмер ([`base.consumer.ts`](../../apps/api/src/platform/messaging/base.consumer.ts)) сам делает `channel.prefetch`, разбор сообщения, dedup по `messageId`, экспоненциальный retry ([`retry-backoff.ts`](../../apps/api/src/platform/messaging/retry-backoff.ts)) и перекладывание в DLQ после лимита попыток — без готового декоратора `@RabbitSubscribe`.

## Последствия

- Backpressure (prefetch), retry/DLX и идемпотентность консьюмеров — видимый код, а не скрытая настройка библиотеки; ревьюеру есть что открыть и прочитать.
- Больше кода на старте (топология, base consumer) по сравнению с декоративным подходом — оправдано только потому, что это ядро демонстрации, не выбор по умолчанию для обычного прод-сервиса.
- Авто-реконнект и восстановление топологии после разрыва соединения — забота `amqp-connection-manager`, не написана с нуля.
