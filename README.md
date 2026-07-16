# Real-time Load Auction

Портфолио-проект: аукцион по фрахту на понижение (reverse auction). Стек — NestJS
(модульный монолит) + RabbitMQ + Redis + Postgres. Подробности — в
[`docs/specs/load-auction-spec.md`](docs/specs/load-auction-spec.md).

> Заготовка. Полный README (история проекта, карта паттернов, диаграммы) появится в M6-02.

## Запуск локально

```bash
make setup   # .env из примеров (существующие не трогает) + зависимости
make up      # Postgres, RabbitMQ (+management), Redis
pnpm dev     # api + web
```

`make up` возвращается только когда все контейнеры прошли healthcheck.

Два `.env` — это не дублирование: корневой говорит, с какими параметрами **поднять**
инфру (потребитель — docker-compose), `apps/api/.env` — как к ней **подключиться**
(потребитель — api). Локально значения совпадают, на выделенном сервере разойдутся.
Приложения корневой `.env` не читают.

Проверить:

- RabbitMQ management UI — http://localhost:15672 (логин/пароль из `.env.example`)
- Postgres — `psql "postgresql://auction:auction@localhost:5432/auction"`
- Redis — `redis-cli -h localhost -p 6379 ping` → `PONG`

Другие команды: `make down`, `make logs`, `make ps`, `make seed` (заглушка до M2-08).
