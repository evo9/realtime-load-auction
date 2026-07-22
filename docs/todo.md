# M6-04 — ADR: ключевые архитектурные решения

Шесть ADR в `docs/adr/` (MADR-подобный формат «Контекст → Решение → Последствия»), индекс `docs/adr/README.md`, ссылки из корневого README вместо текстового placeholder.

## Implement
- [x] `docs/adr/0001-ioredis-over-node-redis.md`
- [x] `docs/adr/0002-amqplib-over-nestjs-microservices.md`
- [x] `docs/adr/0003-cqrs-lite-without-nestjs-cqrs.md`
- [x] `docs/adr/0004-outbox-and-durable-saga-over-inmemory-eventbus.md`
- [x] `docs/adr/0005-redis-cas-candidate-with-reconciliation.md`
- [x] `docs/adr/0006-nest-11-not-12.md`
- [x] `docs/adr/README.md` — индекс (номер | заголовок | статус)
- [x] README — заменил placeholder «Архитектурные решения (ADR)» на ссылки

## Verify
- [x] Каждое утверждение подкреплено конкретным файлом текущего кода (defineCommand/eval в platform/redis, topology.ts/base.consumer.ts, прямые вызовы хендлеров, outbox+saga_instances, reconcileIfCurrent, package.json/CLAUDE.md) — не только цитатой из ТЗ
- [x] Все ссылки (README, индекс ADR, кросс-ссылки между самими ADR) программно сверены с файловой системой — все валидны

## Pipeline
- [ ] Запись в docs/worklog.md + галочка в docs/tasks/INDEX.md
