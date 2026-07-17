# Worklog

Журнал выполненных задач: что реально сделано, где это лежит и чем доказано. Запись появляется **сразу после того, как ревьюер вернул PASS, и до отчёта о готовности в чате** — это последнее действие задачи, а не первое действие следующей. Команда `/task-done` — лишь один из способов прогнать закрывающий конвейер, но не триггер записи: без неё запись всё равно обязательна. Записи не редактируются и не удаляются: только append сверху.

Задним числом не дописываем. Если обнаружилась выполненная, но не залогированная задача — не латай журнал молча: скажи об этом и прогони закрывающий конвейер (ревью + зелёные lint/build/test), иначе запись будет декларацией, а не фактом.

Назначение — быстрый ответ на «что уже готово и как это проверялось» в начале новой сессии, без раскопок в git log. Статус задач при этом отмечается галочкой в [tasks/INDEX.md](tasks/INDEX.md); детали — здесь.

Формат записи:

```
## YYYY-MM-DD — <ID задачи> <короткое название>
**Что:** 1–3 строки по существу — что появилось, какое решение принято
**Файлы:** ключевые пути (не полный diff)
**Проверено:** тесты/команды, которые это доказывают
**Заметки:** отклонения от задачи, отложенное, замеченные грабли — опционально
```

Правила:

- Одна запись — одна задача из `docs/tasks/`. Задачи вне INDEX.md логируются как `ad-hoc — <название>`.
- Не логируй непроверенное: нет PASS ревьюера или зелёных lint/build/test — нет записи.
- Никакой статистики изменений, никаких чек-листов тест-плана, никаких упоминаний ассистента (см. [code-style.md](../.claude/rules/code-style.md)).
- Уроки и корректировки — не сюда, а в [lessons.md](lessons.md). Здесь — только факт выполнения.

---

<!-- записи ниже, новые сверху -->

## 2026-07-16 — M1-04 платформенные модули-заглушки + проводка AppModule

**Что:** `AppModule` доведён до формы §9.1: `RedisModule`, `MessagingModule`, `OutboxModule`, `IdempotencyModule`, `SchedulerModule` зарегистрированы после `PersistenceModule` в каноническом порядке. `redis` — единственный реально живой из пяти: `ioredis`-клиент за DI-токеном `REDIS_CLIENT`, читает `config.redis`, graceful shutdown через `OnModuleDestroy` + `app.enableShutdownHooks()`. `messaging` кладёт секцию конфига (`config.rabbitmq`) в токен `RABBITMQ_OPTIONS` под будущее подключение в M2-02, без реального соединения (`amqplib` сознательно не ставился — это объём M2-02). `outbox`/`idempotency`/`scheduler` — буквально пустые `@Module({})`: у них нет собственной секции конфига до M2-03/M3-01/M2-04. `GET /health` теперь пингует и Postgres, и Redis, возвращает по какому компоненту упало.
**Файлы:** `apps/api/src/platform/{redis,messaging,outbox,idempotency,scheduler}/`, `apps/api/src/app.module.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/src/main.ts` (`enableShutdownHooks`), `apps/api/package.json` (`ioredis`, `@testcontainers/redis`)
**Проверено:** `pnpm -C apps/api lint/test/test:e2e/test:integration/build` зелёные; `test:integration` — `ioredis` реально подключается к эфемерному Redis (testcontainers) и отвечает на `ping`; `/health` → `200 {status:ok,db:ok,redis:ok}` при живой инфре, `503` с точным указанием упавшего компонента при остановке Postgres или Redis по отдельности, восстанавливается после рестарта контейнера. Отдельно проверено `SIGTERM`: `ioredis`-соединение в `redis-cli client list` реально исчезает после сигнала (не просто "процесс завершился") — граница shutdown-хука доказана, а не задекларирована. Ревью `load-auction-reviewer` — **PASS WITH WARNINGS** → warning (`enableShutdownHooks` отсутствовал) исправлен и повторно проверен.

## 2026-07-16 — M1-03 platform/persistence: TypeORM, UnitOfWork, миграции

**Что:** Слой доступа к Postgres на TypeORM: `PersistenceModule` (`TypeOrmModule.forRootAsync` через `AppConfigService`, `autoLoadEntities`), `UnitOfWork.transaction(work)` с `TransactionContext` (manager + generic `lockForUpdate` через `pessimistic_write` + `outbox`-порт), `BaseRepository`/`Mapper` как контракты под будущие сущности (M2). Outbox подключён как DI-порт (`OUTBOX_PORT`, дефолт — понятная ошибка «не настроен, см. M2-03»), не как прямая зависимость на ещё не существующий `platform/outbox`. Миграции — `typeorm-ts-node-commonjs` CLI поверх `data-source.ts`, пустая baseline-миграция. `GET /health` теперь реально пингует БД (`SELECT 1`, 503 при недоступности).
**Файлы:** `apps/api/src/platform/persistence/`, `apps/api/src/health/health.controller.ts`, `apps/api/src/app.module.ts`, `apps/api/jest-integration.json`, `apps/api/package.json` (`migration:*`, `test:integration`)
**Проверено:** `pnpm -C apps/api lint/test/test:e2e/test:integration/build` зелёные; `test:integration` — commit/rollback/`lockForUpdate` на реальном Postgres через `@testcontainers/postgresql`; `migration:run`/`revert` применяют/откатывают baseline на живом Postgres из `make up`; `/health` → 200 при живой БД, 503 при остановленном контейнере, восстанавливается после рестарта. Ревью `load-auction-reviewer` — **PASS**.

## 2026-07-16 — M1-02 NestJS scaffold: config, логирование, healthcheck

**Что:** Бутстрап-слой `apps/api`: типизированный `AppConfigService` поверх `@nestjs/config` с zod-схемой (`validateEnv` — читаемое сообщение об отсутствующих переменных), собственный `apps/api/.env`/`.env.example` (резолвится абсолютным путём от `dist`, не зависит от cwd), `nestjs-pino` со структурными JSON-логами и корреляцией по `x-request-id`, `helmet` + глобальный `ValidationPipe`, `GET /health` liveness-эндпоинт. `make setup` создаёт оба `.env`-файла и ставит зависимости обоих apps. Убран дефолтный hello-world скаффолд.
**Файлы:** `apps/api/src/config/`, `apps/api/src/health/`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/.env.example`, `Makefile` (цель `setup`), `apps/api/tsconfig.json` (`@src/*` алиас — пока только для тайп-чекинга/тестов)
**Проверено:** `pnpm -C apps/api lint/test/build` зелёные; `GET /health` → `200 {"status":"ok"}` с JSON-логом и `req.id`; при отсутствии обязательной env — понятная ошибка на bootstrap, процесс падает. Ревью `load-auction-reviewer` — **PASS**.

## 2026-07-16 — M1-01 docker-compose + Makefile

**Что:** Локальная инфра одной командой: `docker-compose.yml` (postgres:16-alpine, rabbitmq:3-management-alpine, redis:7-alpine с appendonly) с healthcheck на каждом сервисе, `Makefile` (`up/down/logs/ps/seed`-заглушка), `.env.example` с параметрами подключения, корневой `README.md` с коротким сниппетом запуска.
**Файлы:** `docker-compose.yml`, `Makefile`, `.env.example`, `README.md`, `.gitignore` (добавлен `.env`)
**Проверено:** `make up` — все три контейнера `healthy` (`docker compose up -d --wait`); RabbitMQ management отвечает `HTTP 200` на :15672; `redis-cli ping` → `PONG`; `psql` подключается к `auction`/`auction`/`auction`; `make down` останавливает без висящих контейнеров.
