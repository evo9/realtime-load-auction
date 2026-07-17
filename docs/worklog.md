# Worklog

Журнал выполненных задач: что реально сделано, где это лежит и чем доказано. Пишется в конце `/task-done` — **после** того, как ревьюер вернул PASS. Записи не редактируются и не удаляются: только append сверху.

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

## 2026-07-16 — M1-02 NestJS scaffold: config, логирование, healthcheck

**Что:** Бутстрап-слой `apps/api`: типизированный `AppConfigService` поверх `@nestjs/config` с zod-схемой (`validateEnv` — читаемое сообщение об отсутствующих переменных), собственный `apps/api/.env`/`.env.example` (резолвится абсолютным путём от `dist`, не зависит от cwd), `nestjs-pino` со структурными JSON-логами и корреляцией по `x-request-id`, `helmet` + глобальный `ValidationPipe`, `GET /health` liveness-эндпоинт. `make setup` создаёт оба `.env`-файла и ставит зависимости обоих apps. Убран дефолтный hello-world скаффолд.
**Файлы:** `apps/api/src/config/`, `apps/api/src/health/`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/.env.example`, `Makefile` (цель `setup`), `apps/api/tsconfig.json` (`@src/*` алиас — пока только для тайп-чекинга/тестов)
**Проверено:** `pnpm -C apps/api lint/test/build` зелёные; `GET /health` → `200 {"status":"ok"}` с JSON-логом и `req.id`; при отсутствии обязательной env — понятная ошибка на bootstrap, процесс падает. Ревью `load-auction-reviewer` — **PASS**.

## 2026-07-16 — M1-01 docker-compose + Makefile

**Что:** Локальная инфра одной командой: `docker-compose.yml` (postgres:16-alpine, rabbitmq:3-management-alpine, redis:7-alpine с appendonly) с healthcheck на каждом сервисе, `Makefile` (`up/down/logs/ps/seed`-заглушка), `.env.example` с параметрами подключения, корневой `README.md` с коротким сниппетом запуска.
**Файлы:** `docker-compose.yml`, `Makefile`, `.env.example`, `README.md`, `.gitignore` (добавлен `.env`)
**Проверено:** `make up` — все три контейнера `healthy` (`docker compose up -d --wait`); RabbitMQ management отвечает `HTTP 200` на :15672; `redis-cli ping` → `PONG`; `psql` подключается к `auction`/`auction`/`auction`; `make down` останавливает без висящих контейнеров.
