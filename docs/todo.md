# M4-01 — settlement: модель состояния саги + saga_instances

План: /Users/evo/.claude/plans/fluttering-floating-rain.md

## Implement
- [x] `modules/settlement/domain/saga.ts` (SagaStep, SagaStatus, STEP_ORDER, FIRST_STEP, nextStep, SagaPayload, SagaInstance) + `saga.spec.ts`
- [x] `modules/settlement/infrastructure/saga-instance.entity.ts` (+ `@Unique(['lotId'])`, `@VersionColumn`)
- [x] `modules/settlement/infrastructure/saga.mapper.ts`
- [x] `modules/settlement/infrastructure/saga.repository.ts` (create/findByLotId/findById/update)
- [x] `modules/settlement/infrastructure/settlement-trigger.consumer.ts` (BaseConsumer на Queues.settlement, lot.closed → sagas.create)
- [x] `modules/settlement/settlement.module.ts`
- [x] `platform/persistence/migrations/1784900000000-CreateSagaInstances.ts`
- [x] `app.module.ts` — регистрация SettlementModule

## Test
- [x] `saga.spec.ts` — nextStep/порядок шагов
- [x] `settlement-trigger.consumer.integration-spec.ts` — lot.closed создаёт running/lock; редеставка не дублирует
- [x] `saga.repository.integration-spec.ts` — рестарт (DataSource A→B) не теряет прогресс; optimistic lock работает

## Verify
- [x] `pnpm -C apps/api lint`
- [x] `pnpm -C apps/api build`
- [x] `pnpm -C apps/api test`
- [x] `pnpm -C apps/api test:integration`
- [x] миграция накатывается на реальную инфру (`make up` + `migration:run`)

## Pipeline
- [x] `reviewer` — PASS WITH WARNINGS (warning закрыт комментарием на `update()`)
- [x] `security-review` — без Critical/High
- [x] `spec-guardian` — ALIGNED
- [x] `pattern-verifier` — PROVEN
- [x] worklog.md запись + INDEX.md галочка
- [x] отчёт в чат
