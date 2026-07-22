# 0001 — `ioredis` вместо `node-redis`

**Статус:** Accepted

## Контекст

Redis официально рекомендует `node-redis` для новых проектов. Но конкурентность на ставках держится на атомарном compare-and-set — Lua-скрипт, который читает текущую лучшую ставку и статус лота и атомарно принимает/отклоняет новую ([`cas.service.ts`](../../apps/api/src/platform/redis/cas.service.ts), [`lua-scripts.ts`](../../apps/api/src/platform/redis/lua-scripts.ts)). Тот же приём нужен sliding-window rate-limit'у ([`rate-limiter.ts`](../../apps/api/src/platform/redis/rate-limiter.ts)) и ZSET-шедулеру таймеров ([`zset-scheduler.ts`](../../apps/api/src/platform/scheduler/zset-scheduler.ts)) — оба тоже гоняют собственные Lua-скрипты.

## Решение

Клиент Redis — `ioredis`. `client.defineCommand(name, {lua})` регистрирует Lua-скрипт как обычный метод клиента с автоматическим `EVALSHA`/кэшированием скрипта — используется в CAS, rate-limiter и шедулере; распределённый лок ([`lock.service.ts`](../../apps/api/src/platform/redis/lock.service.ts)) идёт через `client.eval` напрямую там, где скрипт одноразовый и не переиспользуется по многу раз в секунду.

## Последствия

- Атомарные Lua-операции читаются как обычные TypeScript-методы (`this.commands.casBeatHighBid(...)`), а не как ручная сборка `EVAL`-вызовов на каждый call site.
- Зрелый Pub/Sub и cluster-режим — задел на будущее без смены клиента, если проект вырастет за один инстанс Redis.
- Плата: `node-redis` — более активно развиваемый официальный клиент; выбор ioredis — осознанный компромисс ради удобства Lua/CAS здесь и сейчас, а не «взяли что попроще».
