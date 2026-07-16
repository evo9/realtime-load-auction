# M4-01 — settlement: модель состояния саги + таблица saga_instances

**Майлстоун:** M4 (saga)
**Зависимости:** M2-02
**Оценка:** M (0.5–1 день)

## Цель
Персистентный каркас оркестрированной саги (§7): состояние переживает рестарт; основа для шагов и компенсаций.

## Объём работ
- Таблица `saga_instances` (§7: `id`, `lotId`, `step`, `status`, `payload` jsonb, `attempts`, timestamps) + миграция.
- Типы: enum шагов (lock→winner→reserve→invoice→notify→settle), статусы (running/compensating/completed/failed).
- Репозиторий саги (CRUD состояния в рамках UoW).
- Exchange `settlement.commands` (direct) + `settlement.steps.q` уже декларированы в M2-02 — здесь подключаем consumer-каркас шагов.
- Триггер: consumer на `settlement.q` (`lot.closed`) создаёт инстанс саги.

## Definition of Done
- `lot.closed` создаёт `saga_instances` строку в статусе running на шаге 1.
- Состояние читается/обновляется атомарно; рестарт не теряет прогресс (тест: создать → «рестарт» → продолжить).
