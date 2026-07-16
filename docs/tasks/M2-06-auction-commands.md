# M2-06 — auction: команды CreateLot/OpenLot/CloseLot/CancelLot + scheduler + outbox

**Майлстоун:** M2 (лоты)
**Зависимости:** M2-03, M2-04, M2-05, M1-05
**Оценка:** L (1.5 дня)

## Цель
Write-путь модуля `auction` (§4): команды жизненного цикла с оптимистичной блокировкой, планированием open/close и публикацией событий через outbox.

## Объём работ
- Хендлеры (обычные `@Injectable`, без CommandBus — §4.1):
  - `CreateLot` (shipper-path, §10 `POST /lots`): `draft→scheduled`, планирование open/close в ZSET (M2-04).
  - `OpenLot`: `scheduled→open`, инициализация `lot:{id}:status=open`, outbox `lot.opened`.
  - `CloseLot`: `open→closing`, анти-снайп (продление closeAt если ставка в окне), outbox `lot.closing`/`lot.closed`; distributed lock (M2-01) — закрытие ровно один раз.
  - `CancelLot`: `→cancelled` (нет ставок / отмена шиппера), outbox.
- Все смены состояния — внутри UoW с записью outbox в той же TX; bump `version`.
- `POST /lots`, `POST /lots/:id/cancel` (API, shipper-роль), `GET /lots/:id` (детали).
- Диспетчер scheduler → OpenLot/CloseLot.

## Definition of Done
- Полный цикл `scheduled→open→closing→settled?`(closing здесь, settled — M4) проходит по таймерам ZSET.
- Конкурентный `CloseLot` закрывает лот один раз (lock + version).
- События `lot.opened/closing/closed` появляются в RMQ через outbox.
- Анти-снайп продлевает closeAt при ставке в окне (тест).
