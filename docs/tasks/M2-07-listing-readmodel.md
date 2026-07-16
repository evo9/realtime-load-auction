# M2-07 — listing: read-model (проекция из событий) + query-API

**Майлстоун:** M2 (лоты)
**Зависимости:** M2-02, M2-06
**Оценка:** M (1 день)

## Цель
Read-model для списка/деталей лотов (§4, §10) как проекция из событий — демонстрация разделения read/write путей (CQRS-lite).

## Объём работ
- Consumer на `listing.q` (`lot.opened`, `lot.closed`): идемпотентный (dedup — M3-01), проецирует в таблицу `listing_lots` (денормализованная витрина).
- Миграция `listing_lots` (поля для фильтров: status, origin/destination, equipmentType, closeAt, currentBest).
- Query-хендлеры (бьют прямо в read-model, отдают DTO — §4.1): `GET /lots` (фильтры) + страница/курсор.
- Обновление `currentBest` подпишется на `bid.placed` (доводка в M3-05/проекция bid).

## Definition of Done
- После `OpenLot` лот появляется в `GET /lots`; после `lot.closed` — статус меняется.
- Фильтры (status, equipmentType, маршрут) работают.
- Повторная доставка события не дублирует строку (идемпотентность проекции).
