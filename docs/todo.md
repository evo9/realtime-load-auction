# M5-05 — web: ops-экран (саги + DLQ), опционально

Бэкенд (`GET /ops/sagas`, `GET /ops/dlq`) уже реализован в M4-04, `@Roles('admin')`. Requeue-кнопка — явно опциональна в тексте задачи И у бэка нет соответствующего эндпоинта (см. worklog M4-04: "Requeue/retry-эндпоинт... помечен как опциональный и не входит в DoD") — не реализуем, чтобы не изобретать несуществующий контракт.

Доступ: единственная линия защиты — бэк (`@Roles('admin')`, уже enforced). Фронт: (1) страница ловит 403 от `getOpsSagas`/`getOpsDlq` и показывает "нет доступа" вместо краша; (2) ссылка "Ops" в nav скрыта для не-admin (чисто UX, не граница безопасности).

## Implement
- [ ] `types/contracts.ts` — `SagaStep`, `SagaStatus`, `SagaOpsDto`, `ListSagasQuery`, `DlqMessageDto`, `DlqQueueSummaryDto`
- [ ] `lib/api/endpoints.ts` — `getOpsSagas(query, token)`, `getOpsDlq(limit, token)`
- [ ] `components/ops/saga-filters.tsx` — фильтры статус/шаг через searchParams (по образцу `lot-filters.tsx`)
- [ ] `components/ops/saga-table.tsx` — таблица саг (шаг/статус/лот/попытки/обновлено, ссылка на `/lots/:id`)
- [ ] `components/ops/dlq-panel.tsx` — панель DLQ (очередь/dlq-имя/счётчик/раскрывающийся список сообщений)
- [ ] `app/(protected)/ops/page.tsx` — SSR-страница, параллельный фетч саг+DLQ, catch 403 → "нет доступа"
- [ ] `components/nav.tsx` — ссылка "Ops", видна только `user?.role === 'admin'`

## Verify
- [ ] `pnpm -C apps/web lint && build`
- [ ] Ручной прогон: логин admin (ops@example.com) → `/ops` показывает саги+DLQ; логин carrier → нет ссылки в nav, прямой заход на `/ops` → "нет доступа" (403 от бэка)

## Pipeline
- [ ] `reviewer`
- [ ] `spec-guardian`
- [ ] `security-review`
- [ ] worklog.md + INDEX.md
- [ ] отчёт в чат
