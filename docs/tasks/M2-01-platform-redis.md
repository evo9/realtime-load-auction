# M2-01 — platform/redis: примитивы (Lock, RateLimiter, PubSub, CAS-каркас)

**Майлстоун:** M2 (лоты) — платформенный задел
**Зависимости:** M1-04
**Оценка:** M (1 день)

## Цель
Реализовать переиспользуемые Redis-примитивы из §4 (платформа) и §8.2 (карта ключей). CAS-Lua только каркасом — полная логика в M3-02.

## Объём работ
- `LockService` (Redlock-lite): `SET NX` + token + Lua-release. Ключ `lot:{id}:lock`.
- `RateLimiter`: sliding-window на zset/counter, ключ `ratelimit:{carrier}:{lot}` (использует bidding в M3).
- `PubSub`: тонкая обёртка publish/subscribe поверх `ioredis` (отдельные коннекты на pub/sub).
- `CasService`: загрузка Lua-скрипта через `defineCommand`/`evalsha`, метод-каркас `tryBeatHighBid` (без бизнес-сравнения — заглушка-«accept», доделать в M3-02).
- Helper для ключей (`lot:{id}:high`, `:status`) — единый билдер имён.

## Definition of Done
- `LockService`: два конкурентных захвата — только один успешен; release по токену (integration-тест на реальном Redis / testcontainers).
- `PubSub`: publish→subscribe доставляет сообщение в тесте.
- `RateLimiter` отдаёт remaining/allowed корректно в окне.
