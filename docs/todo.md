# M4-04 — Ops-видимость: состояния саг + содержимое DLQ

План: /Users/evo/.claude/plans/fluttering-floating-rain.md

## Implement
- [x] `identity/domain/user.ts` — Role += 'admin'
- [x] `seed/seed-data.ts` — admin seed-пользователь
- [x] `platform/messaging/dlq-inspector.ts` — counts/peek (неразрушающий, requeue после чтения)
- [x] `messaging.module.ts` — DlqInspector в providers/exports
- [x] `settlement/infrastructure/saga.repository.ts` — `list(filter)` + tie-break по id
- [x] `settlement.module.ts` — exports: [SagaRepository]
- [x] `modules/ops/**` — ops.module, list-sagas.handler, list-dlq.handler, ops.controller, DTOs
- [x] `app.module.ts` — регистрация OpsModule

## Test
- [x] `saga.repository.integration-spec.ts` — list по статусу/шагу/lotId/limit/offset
- [x] `dlq-inspector.integration-spec.ts` — counts, peek неразрушающий
- [x] `list-sagas.handler.spec.ts` / `list-dlq.handler.spec.ts` — unit
- [x] `test/ops.e2e-spec.ts` — 401/403/200, форма ответа

## Verify
- [x] `pnpm -C apps/api lint`
- [x] `pnpm -C apps/api build`
- [x] `pnpm -C apps/api test` (167/167)
- [x] `pnpm -C apps/api test:integration` (28/28, 97/97, 2 прогона)
- [x] `pnpm -C apps/api test:e2e` (8/8, 24/24, 2 прогона)

## Pipeline
- [x] `reviewer` — NEEDS REVISION → фикс lockToken → PASS
- [x] `security-review` — Medium (lockToken) устранён
- [x] `spec-guardian` — ALIGNED
- [x] `pattern-verifier` — PROVEN
- [x] worklog.md + INDEX.md (закрывает M4)
- [x] отчёт в чат
