# 0003 — CQRS-lite без `@nestjs/cqrs`

**Статус:** Accepted

## Контекст

Разделение read/write путей — полезный принцип (лоты создаются и меняются иначе, чем читаются в листинге), но `@nestjs/cqrs` добавляет к нему `CommandBus`/`QueryBus`/`EventBus` — in-process шину поверх и без того одного процесса. В монолите эта шина не даёт межпроцессной развязки (её и так нет), только косвенность вызова и потерю «go to definition» (§4.1 ТЗ).

## Решение

Хендлеры — обычные `@Injectable`-сервисы (`CreateLotHandler`, `PlaceBidHandler`, `GetLotBidsHandler` и т.д.); контроллер вызывает их напрямую (см. [`lots.controller.ts`](../../apps/api/src/modules/auction/api/lots.controller.ts), [`bids.controller.ts`](../../apps/api/src/modules/bidding/api/bids.controller.ts)). Query-хендлеры не повторяют церемонию write-пути — читают из read-model напрямую и отдают DTO ([`list-lots.handler.ts`](../../apps/api/src/modules/listing/application/list-lots.handler.ts)). `EventBus`/rxjs-саги из `@nestjs/cqrs` не используются вообще — событийный костяк проекта уже есть: outbox → RabbitMQ и durable-saga ([ADR 0004](0004-outbox-and-durable-saga-over-inmemory-eventbus.md)).

## Последствия

- Каждый вызов трассируется обычным переходом по определению в IDE — не нужно грепать `@CommandHandler(...)`, чтобы найти, кто и как обрабатывает команду.
- Меньше boilerplate (нет команд-объектов, обёрток-хендлеров под интерфейс шины) — хендлер это просто класс с методом `execute`.
- Плата: не будет единой точки для сквозных concerns (логирование/метрики через middleware шины) — если понадобится, придётся явно завести interceptor/decorator, а не получить его бесплатно от `@nestjs/cqrs`.
