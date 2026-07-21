# Задачи — Real-time Load Auction

Разбивка ТЗ ([load-auction-spec.md](../specs/load-auction-spec.md)) на логические задачи (средняя гранулярность, ≈0.5–2 дня каждая). Сгруппированы по майлстоунам §14. Каждая задача — отдельный файл с целью, объёмом работ, зависимостями и Definition of Done.

Галочка означает: задача принята ревьюером и записана в [worklog.md](../worklog.md) — там детали реализации и чем она проверена.

Порядок внутри майлстоуна учитывает зависимости. Платформенные пакеты (`messaging`, `outbox`, `redis`, `scheduler`) подняты в M2, так как `auction`/`listing` без них не работают (в ТЗ они помечены как M3/платформа — это сознательное уточнение порядка, отмечено в зависимостях задач).

## M1 — каркас
- [x] [M1-01](M1-01-infra-docker-compose.md) — docker-compose + Makefile (postgres/rabbitmq/redis)
- [x] [M1-02](M1-02-nest-scaffold.md) — NestJS scaffold: config, логи, healthcheck
- [x] [M1-03](M1-03-platform-persistence.md) — platform/persistence: TypeORM, UoW, миграции
- [x] [M1-04](M1-04-platform-stubs.md) — платформенные модули-заглушки + проводка AppModule
- [x] [M1-05](M1-05-identity.md) — identity: пользователи, роли, JWT, login

## M2 — лоты
- [x] [M2-01](M2-01-platform-redis.md) — platform/redis: Lock, RateLimiter, PubSub, CAS-каркас
- [x] [M2-02](M2-02-platform-messaging.md) — platform/messaging: топология, publisher, base consumer, QoS, retry/DLX
- [x] [M2-03](M2-03-platform-outbox.md) — platform/outbox: таблица + relay
- [x] [M2-04](M2-04-platform-scheduler.md) — platform/scheduler: ZSET-планировщик
- [x] [M2-05](M2-05-auction-domain.md) — auction: домен лота + state-machine + миграция
- [x] [M2-06](M2-06-auction-commands.md) — auction: команды Create/Open/Close/Cancel + scheduler + outbox
- [x] [M2-07](M2-07-listing-readmodel.md) — listing: read-model (проекция) + query-API
- [x] [M2-08](M2-08-seed.md) — seed: шипперы, пользователи, лоты

## M3 — горячий путь
- [x] [M3-01](M3-01-platform-idempotency.md) — platform/idempotency: API-интерсептор + дедуп консьюмеров
- [x] [M3-02](M3-02-cas-lua.md) — Lua CAS + reconciliation
- [ ] [M3-03](M3-03-bidding-hot-path.md) — bidding: горячий путь PlaceBid (idem→CAS→TX+outbox)
- [ ] [M3-04](M3-04-bidding-queries.md) — bidding: query-путь (история, мои ставки)
- [ ] [M3-05](M3-05-realtime-gateway.md) — realtime: WS-gateway + Redis Pub/Sub fan-out
- [ ] [M3-06](M3-06-notification.md) — notification: идемпотентный мультиканальный консьюмер

## M4 — saga
- [ ] [M4-01](M4-01-saga-state.md) — settlement: модель состояния саги + saga_instances
- [ ] [M4-02](M4-02-saga-steps.md) — settlement: шаги саги + компенсации
- [ ] [M4-03](M4-03-retry-dlx.md) — retry/DLX + backpressure на всех консьюмерах
- [ ] [M4-04](M4-04-ops-visibility.md) — ops-видимость: состояния саг + DLQ

## M5 — фронт
- [ ] [M5-01](M5-01-web-scaffold.md) — web scaffold: Next.js, auth, react-query, WS-клиент
- [ ] [M5-02](M5-02-web-lots-list.md) — список лотов (SSR + фильтры)
- [ ] [M5-03](M5-03-web-live-lot.md) — страница живого лота (WS, отсчёт, форма) — витрина
- [ ] [M5-04](M5-04-web-my-bids.md) — дашборд «Мои ставки»
- [ ] [M5-05](M5-05-web-ops-screen.md) — ops-экран (саги + DLQ) — опц.

## M6 — оживление + полировка
- [ ] [M6-01](M6-01-demo-generator.md) — генератор демо-активности (боты)
- [ ] [M6-02](M6-02-readme.md) — README: история + карта паттернов
- [ ] [M6-03](M6-03-diagrams.md) — диаграммы: C4 + горячий путь + saga
- [ ] [M6-04](M6-04-adr.md) — ADR: ключевые решения
- [ ] [M6-05](M6-05-ci.md) — CI: lint + test + build + testcontainers

## Граф зависимостей (ключевое)
```
M1-01 → M1-02 → M1-03 → {M1-04, M1-05}
M1-04 → {M2-01, M2-02}
M1-03 + M2-02 → M2-03
M2-01 → M2-04
M1-03 → M2-05
{M2-03, M2-04, M2-05, M1-05} → M2-06 → M2-07(+M2-02), M2-08
M2-01 → M3-01, M3-02
{M3-01, M3-02, M2-03} → M3-03 → M3-04
{M2-01, M3-03} → M3-05 → M3-06
M2-02 → M4-01 → M4-02(+M2-01) → M4-03 → M4-04
{M1-05, M3-05} → M5-01 → {M5-02, M5-03, M5-04, M5-05}
M2-06+M3-03 → M6-01 ; финал → M6-02..M6-05
```

> Каждый майлстоун самодостаточен и демонстрируем (§14): если остановиться на M3 — уже есть рассказываемая история (горячий путь + инфра).
