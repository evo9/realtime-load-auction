# M2-05 — auction: доменная модель лота + state-machine + миграция

**Майлстоун:** M2 (лоты)
**Зависимости:** M1-03
**Оценка:** M (0.5–1 день)

## Цель
Доменные типы лота и явная state-machine (§3) без агрегатов/value-объектов (CQRS-lite, §4.1).

## Объём работ
- Тип `Lot` (поля §3: id, shipperId, origin/destination, equipmentType, weightKg, pickupWindow, reservePrice, targetPrice?, openAt, closeAt, antiSnipeWindowSec, status, version, winningBidId?, winningAmount?).
- State-machine: `draft→scheduled→open→closing→settled` и `→cancelled`; функция-валидатор переходов (запрет невалидных).
- TypeORM-entity + mapper (domain ↔ entity), миграция таблицы `lots` с `version` (оптимистичная блокировка).
- `BidLite`-ссылка для результата (winningBidId).

## Definition of Done
- Все валидные переходы разрешены, невалидные кидают доменную ошибку (unit-тесты на матрицу переходов).
- Миграция создаёт `lots` с уникальными/индексными ограничениями (status, closeAt для шедулера).
- Mapper round-trip (domain→entity→domain) не теряет полей.
