# M6-05 — CI: lint + test + build (+ testcontainers)

`.github/workflows/ci.yml` — 4 job'а (lint/unit-test/integration-test/build), бейдж в README. Закрывает майлстоун M6.

## Implement
- [x] `.github/workflows/ci.yml` — lint, unit-test, integration-test (testcontainers, Docker из коробки на ubuntu-latest), build
- [x] README — бейдж статуса CI под заголовком

## Verify
- [x] YAML синтаксически валиден (js-yaml парсер, не «на глаз»)
- [x] Реально поставил `act` через brew и прогнал job'ы локально — нашёл и исправил 2 настоящих бага, которые задекларированный-но-непроверенный YAML пропустил бы:
  1. `packageManager: pnpm@9` в корневом package.json не соответствовал реальности (локально pnpm 11.5.1; `pnpm-workspace.yaml` с `allowBuilds` без `packages:` не парсится pnpm 9) — поправил на точную версию `11.5.1`, синхронно в CI.
  2. `apps/api/.env` гитигнорится → в чистом чекауте (что на `act`, что на реальном GH Actions) отсутствует → `AppConfigModule`'s `ConfigModule.forRoot()` валидирует env **в момент импорта файла** (не при DI-компиляции) → любой spec, транзитивно тянущий platform-модуль (напр. `health.controller.spec.ts` → `REDIS_CLIENT` из `redis.module.ts`), падает. Фикс — `cp apps/api/.env.example apps/api/.env` перед тестами (то же самое, что локально делает `make setup`).
  Заодно ограничил `--maxWorkers=2` для unit-test (Docker Desktop здесь — 8 CPU/~5.8GiB RAM, дефолтный воркер-пул на этом хосте более требователен к памяти).
- [x] `lint`, `unit-test`, `build` — реально зелёные через `act` (unit-test: 28/28 сьютов, 188/188 тестов)
- [x] `integration-test` — команды те же, что многократно зелёные локально (98/98 тестов); сам job через `act` не удалось проверить до конца — Docker-outside-of-Docker сетевая ловушка (testcontainers внутри act-контейнера не резолвит `localhost` до портов, проброшенных на хосте) — это ограничение симуляции `act` (она всегда оборачивает job в контейнер), не GitHub Actions (там job выполняется прямо на VM раннера, без вложенного контейнера, раз `container:` не указан) — задокументировано как разумное ограничение верификации, не как непроверенный риск
- [x] Бейдж в README указывает на реальный путь workflow-файла
- [x] `act` снесён после использования (`brew uninstall`), пул-образы `act`/testcontainers удалены — footprint не оставлен

## Побочная находка (важно, не в объёме задачи)
Обнаружено: в логах docker-compose `postgres` пользователя (`make up`) — эпизод `PANIC: could not write to file ... No space left on device` сегодня в 19:08 UTC, самостоятельно восстановился к 19:09 UTC (до начала этой задачи). Хостовый диск оставался близким к заполнению (6.3GiB свободно из 228GiB) — докер-пуллы для `act` временно ухудшали запас, исправлено (образы удалены, снова свободно 9.1GiB). Контейнер не трогал; на момент завершения задачи — подтверждённо healthy.

## Pipeline
- [ ] Запись в docs/worklog.md + галочка в docs/tasks/INDEX.md (закрывает M6)
