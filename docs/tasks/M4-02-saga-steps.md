# M4-02 — settlement: шаги саги + компенсации

**Майлстоун:** M4 (saga) — ключевая демонстрация
**Зависимости:** M4-01, M2-01
**Оценка:** L (2 дня)

## Цель
Реализовать оркестрацию закрытия лота (§7): цепочка шагов через RMQ-команды с компенсациями в обратном порядке при падении.

## Объём работ
Шаги (таблица §7):
1. Distributed lock на лот (`LockService` M2-01) — release в finally.
2. Определить победителя (лучшая валидная ставка из БД).
3. Reserve funds (эмуляция) — компенсация release funds.
4. Сгенерировать инвойс — компенсация void invoice.
5. Notify winner + shipper (через notification M3-06, идемпотентно).
6. `lot.status = settled`, записать результат (`winningBidId`, `winningAmount`) — через auction (M2-06) в UoW + outbox `settlement.completed`.

- Если валидных ставок нет → сразу `cancelled`.
- Падение шага после N ретраев → запуск компенсаций в обратном порядке + `lot.status = cancelled` + outbox `settlement.failed`.
- Каждый шаг — команда в `settlement.steps.q`, идемпотентен по `messageId`.

## Definition of Done
- Happy-path: `lot.closed` → лот `settled`, победитель и сумма записаны, нотификации отправлены.
- Инъекция сбоя на шаге 4 → компенсации шагов 3..1 в обратном порядке, лот `cancelled` (integration-тест).
- Нет валидных ставок → `cancelled` без резервов/инвойса.
- Лот сеттлится ровно один раз (lock + идемпотентность).
