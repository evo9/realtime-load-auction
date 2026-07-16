# M2-04 — platform/scheduler: ZSET-планировщик отложенных команд

**Майлстоун:** M2 (лоты)
**Зависимости:** M2-01
**Оценка:** M (0.5–1 день)

## Цель
Планировщик отложенных команд open/close лота поверх Redis ZSET (§9.7, §8.2). Очередь отложенного живёт в Redis, чтобы переживать рестарт; `@nestjs/schedule` — только тикер.

## Объём работ
- `ZSetScheduler`: `schedule(setKey, dueAtMs, payload)` (zadd; повторный zadd = продление score — анти-снайп); `tick(setKey, dispatch)` (zrangebyscore 0..now → dispatch → zrem).
- Ключи `auction:schedule:open` (score=openAt), `auction:schedule:close` (score=closeAt).
- Тикер с конфигурируемым интервалом; обработка due-батчами; защита от двойного дёргания (атомарный zrem перед dispatch или Lua pop).
- Контракт dispatch: payload содержит `lotId`+тип, диспетчер вызывает `OpenLot`/`CloseLot` (проводка в M2-06).

## Definition of Done
- Запланированный на now+Δ payload диспатчится после Δ (integration-тест с реальным Redis).
- Повторный `schedule` того же payload сдвигает срок (анти-снайп проверен).
- Один payload не диспатчится дважды при конкурентных тиках.
