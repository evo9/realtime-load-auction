# M3-02 — Lua CAS: атомарный compare-and-set лучшей ставки + reconciliation

**Майлстоун:** M3 (горячий путь)
**Зависимости:** M2-01, M2-06
**Оценка:** M (1 день)

## Цель
Атомарное «принять, только если ставка лучше текущей И лот открыт» на Lua (§8.3, §6) + стратегия согласования Redis-кандидата с источником истины (Postgres).

## Объём работ
- Lua-скрипт (§8.3): KEYS=`lot:{id}:high`,`lot:{id}:status`; ARGV=amount,carrierId,bidId. Reverse-auction сравнение (лучше = меньше), возврат `{ok, reason}` (`closed`/`too_low`/`accepted`).
- `CasService.tryBeatHighBid` (§9.4): `evalsha` загруженного скрипта, маппинг в `{accepted, reason}`.
- Reconciliation (§6): трактовка `lot:{id}:high` как *кандидата*; восстановление high-bid из БД при рестарте/первой ставке; откат кандидата при rollback TX (контракт для M3-03).
- Инициализация `lot:{id}:status` при OpenLot/CloseLot (связать с M2-06).

## Definition of Done
- Конкурентные ставки: только реально лучшая «побеждает» в Redis (нагрузочный/конкурентный тест).
- Ставка по закрытому лоту → `closed`; хуже текущей → `too_low`.
- После «потерянного» коммита (rollback после CAS) high-bid реконсилится из БД (тест сценария §6).
