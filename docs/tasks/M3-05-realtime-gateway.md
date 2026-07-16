# M3-05 — realtime: WS-gateway + Redis Pub/Sub fan-out

**Майлстоун:** M3 (горячий путь)
**Зависимости:** M2-01, M3-03
**Оценка:** M (1 день)

## Цель
Realtime-фанаут (§5, §6 шаг 5): событие от любого воркера → Redis Pub/Sub → все WS-инстансы → клиенты канала лота. Работает при нескольких инстансах.

## Объём работ
- `realtime`-gateway на `@nestjs/websockets` + `socket.io` (§13): `WS /realtime`, подписка/отписка на канал лота.
- Подписка gateway на Redis Pub/Sub (`PubSub` из M2-01); ретрансляция событий (`bid.placed`, `lot.opened`, `lot.closing`, `lot.closed`, `settlement.*`) клиентам комнаты лота.
- Публикация в Pub/Sub из горячего пути (шаг 5 §6) и/или из consumer'а `auction.events` → Pub/Sub-мост.
- Auth WS-соединения по JWT; ограничение комнат по лоту.
- Обновление `currentBest` в listing read-model (M2-07) на `bid.placed`.

## Definition of Done
- Два WS-клиента на одном лоте получают `bid.placed` после POST ставки.
- Фанаут работает при двух инстансах API (Pub/Sub, не локальная память) — проверка в integration-тесте/руками.
- Подписка изолирована по лоту (клиент не получает чужие лоты).
