# M1-03 — platform/persistence: TypeORM, UnitOfWork, миграции

**Майлстоун:** M1 (каркас)
**Зависимости:** M1-02
**Оценка:** M (1 день)

## Цель
Базовый слой доступа к Postgres: datasource, паттерн mapper, транзакции/UoW, миграции через TypeORM CLI.

## Объём работ
- `platform/persistence`: модуль с инициализацией TypeORM datasource (`pg`).
- `UnitOfWork` (`uow.transaction(fn)`): обёртка над транзакцией, прокидывает `tx` в репозитории; хук для записи outbox-строк в той же TX (контракт под M2-03).
- Базовый mapper-паттерн (domain ↔ entity), базовый репозиторий.
- Настройка миграций: TypeORM CLI, папка `migrations/`, npm-скрипты `migration:generate/run/revert`.
- Хелпер `lockLotForUpdate` / поддержка оптимистичной блокировки (`version`) — контракт, реализация сущностей в M2.

## Definition of Done
- Приложение коннектится к Postgres, `GET /health` проверяет БД.
- `migration:run` применяет пустую baseline-миграцию.
- `uow.transaction` корректно коммитит/откатывает (покрыто unit/integration-тестом).
