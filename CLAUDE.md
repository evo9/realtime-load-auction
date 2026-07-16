# CLAUDE.md — Real-time Load Auction

Гайд для работы над проектом. Перед задачей: загляни в `docs/specs/load-auction-spec.md` (полное ТЗ) и `docs/tasks/INDEX.md` (разбивка на задачи M1–M6 с зависимостями и Definition of Done).

## Что это
Портфолио-проект: **аукцион по фрахту на понижение** (reverse auction — выигрывает наименьшая цена перевозки). Домен — средство; цель — продемонстрировать инфру и паттерны распределённых систем на стеке **NestJS (модульный монолит) + RabbitMQ + Redis + Postgres**. Аудитория ревью — инженер, который тратит 5–10 минут: README → диаграмма → пара файлов.

## Структура репозитория
```
apps/
  api/   — бэкенд (NestJS 11). Свой CLAUDE.md, своё pnpm-окружение.
  web/   — фронтенд (Next.js 16). Свой CLAUDE.md, своё pnpm-окружение.
docs/
  specs/load-auction-spec.md   — ТЗ (источник истины по требованиям)
  tasks/                       — задачи по майлстоунам + INDEX.md (статус — галочками)
  worklog.md                   — журнал выполненных задач (пишется сразу по завершении задачи, до отчёта в чате)
  lessons.md                   — корректировки от пользователя и выведенные из них правила
  adr/                         — architecture decision records (создаются в M6)
  diagrams/                    — C4 / hot-path / saga (создаются в M6)
package.json                   — тонкий раннер скриптов (НЕ workspace)
```
`api` и `web` **независимы**: у каждого свой `pnpm-lock.yaml` и `node_modules`. Корневой `package.json` — это **тонкий раннер**, а не pnpm workspace (нет `pnpm-workspace.yaml`, нет общего lockfile/хойстинга): он лишь оркестрирует app-скрипты (`pnpm dev` поднимает оба, `pnpm lint`/`pnpm test`/`pnpm build` прогоняют по приложениям). Зависимости приложений ставятся в самих app (`pnpm -C apps/<app> install` или `pnpm install:all`). Инфра (docker/seed) — через `Makefile` (M1-01). Пакетный менеджер — **pnpm**.

## Архитектурные принципы (обязательны к соблюдению)
Эти решения сознательны — не «упрощай», предложив библиотеку, которую ТЗ намеренно исключает:

- **Модульный монолит**, границы по capability. Синхронные in-process вызовы между модулями допустимы; всё, что является шагом workflow (может упасть/тормозить), идёт через RabbitMQ.
- **CQRS-lite — это принцип, не библиотека.** Разделение read/write путей и ничего больше. **НЕ** используем `@nestjs/cqrs`: ни `CommandBus`/`QueryBus`, ни `EventBus`, ни rxjs-саги. Хендлеры — обычные `@Injectable`, контроллер зовёт их напрямую.
- **Без тяжёлого DDD**: нет агрегатов/value-объектов. Домен лота — типы + явная state-machine.
- **Инфра-паттерны пишем руками** (это и есть предмет демонстрации): outbox, idempotency, locks, CAS, rate-limit, saga, топология RabbitMQ. Готовые обёртки (`@nestjs/microservices`, `@golevelup/...`) намеренно не берём.
- Событийный костяк: **outbox → RabbitMQ** (durable) + **durable-saga** с персистентным состоянием. In-memory-шин нет.

## Ключевые паттерны → где живут
Outbox (`platform/outbox` + auction/bidding) · Saga-оркестрация с компенсациями (`settlement`) · Идемпотентность API + консьюмеров (`platform/idempotency`) · Backpressure: prefetch/QoS + DLX-retry (`platform/messaging`) · Атомарный high-bid через Lua CAS (`platform/redis` + bidding) · Distributed lock (`platform/redis`) · ZSET-шедулер таймеров + анти-снайп (`platform/scheduler`) · Realtime fan-out через Redis Pub/Sub (`realtime`). Подробности — §5 ТЗ.

## Доменные инварианты
- Аукцион **на понижение**: новая ставка лучше, если она **меньше** текущей. Сравнение в Lua CAS и в БД идёт «в сторону выгодности».
- Источник истины по состоянию лота — **Postgres** (оптимистичная блокировка через `version`). `lot:{id}:high` в Redis — *кандидат*, реконсилится из БД (см. §6 ТЗ — «тонкое место»).
- Лот закрывается/сеттлится **ровно один раз** (distributed lock + идемпотентность консьюмеров).
- Жизненный цикл: `draft → scheduled → open → closing → settled`, ветка `→ cancelled`.

## Инфраструктура локально
Postgres + RabbitMQ(+management) + Redis поднимаются через `docker-compose` (задача M1-01). Цель — `make up && make seed`. Карта ключей Redis и топология RabbitMQ зафиксированы в §8 ТЗ — придерживайся имён оттуда.

## Рабочий процесс
- Сверяйся с задачей в `docs/tasks/` — там Definition of Done и зависимости. Что уже готово — `docs/worklog.md` и галочки в `INDEX.md`.
- Инфра-паттерны проверяются интеграционными тестами на реальных Postgres/RMQ/Redis (testcontainers) — паттерн должен быть проверен, а не задекларирован.
- Специфика бэка/фронта — в `apps/api/CLAUDE.md` и `apps/web/CLAUDE.md`.
