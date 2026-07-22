# Architecture Decision Records

Короткие записи «Контекст → Решение → Последствия» по неочевидным архитектурным решениям проекта — материал для собеса и для читающего код инженера. Каждая ссылается на конкретные файлы реализации, не только на текст ТЗ.

| № | Решение | Статус |
|---|---|---|
| [0001](0001-ioredis-over-node-redis.md) | `ioredis` вместо `node-redis` | Accepted |
| [0002](0002-amqplib-over-nestjs-microservices.md) | `amqplib`+`amqp-connection-manager` вместо `@nestjs/microservices`/`@golevelup/nestjs-rabbitmq` | Accepted |
| [0003](0003-cqrs-lite-without-nestjs-cqrs.md) | CQRS-lite без `@nestjs/cqrs` | Accepted |
| [0004](0004-outbox-and-durable-saga-over-inmemory-eventbus.md) | Outbox вместо dual-write; durable-saga вместо in-memory EventBus | Accepted |
| [0005](0005-redis-cas-candidate-with-reconciliation.md) | Redis CAS как кандидат + reconciliation с Postgres | Accepted |
| [0006](0006-nest-11-not-12.md) | NestJS 11.x, не 12 | Accepted |
