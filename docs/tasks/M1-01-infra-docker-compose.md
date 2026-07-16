# M1-01 — Инфраструктура: docker-compose + Makefile

**Майлстоун:** M1 (каркас)
**Зависимости:** —
**Оценка:** S (0.5 дня)

## Цель
Поднять локальную инфру одной командой: Postgres, RabbitMQ (+management), Redis.

## Объём работ
- `docker-compose.yml` с тремя сервисами:
  - `postgres` (15+), проброс порта, volume, env (`POSTGRES_USER/PASSWORD/DB`).
  - `rabbitmq` с тегом `management` (порты 5672 + 15672), durable-конфиг.
  - `redis` (7+), порт, опц. appendonly.
- Healthcheck'и на каждый сервис.
- `Makefile`: `make up`, `make down`, `make logs`, `make ps`, `make seed` (заглушка, наполнится в M2-08).
- `.env.example` с переменными подключения.

## Definition of Done
- `make up` поднимает все три контейнера, healthcheck зелёный.
- RabbitMQ management открывается на :15672.
- `psql`/`redis-cli` подключаются с параметрами из `.env.example`.
- README-сниппет «как запустить локально» (короткий, расширится в M6).
