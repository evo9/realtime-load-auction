# M4-02 — settlement: шаги саги + компенсации

План: /Users/evo/.claude/plans/fluttering-floating-rain.md

## Implement
- [x] `saga.ts` — `previousStep(step)`
- [x] `domain/settlement-command.ts` — SettlementStepCommand/StepDirection
- [x] `SagaRepository.lockForUpdate(tx, id)`
- [x] `LockService.acquireOwned(key, token, ttlMs)` + Lua
- [x] `messaging.constants.ts` — `CommandRoutingKeys.settlementStep`
- [x] `infrastructure/step-command.publisher.ts`
- [x] `fund-reservation.entity.ts` + repository + `reservation.service.ts` + миграция
- [x] `invoice.entity.ts` + repository + `invoice.service.ts` + миграция
- [x] `notification/domain/notification.ts` + `notification-templates.ts` — lot_won/lot_settled
- [x] `notification.module.ts` — export NotificationLogRepository
- [x] `settlement-notifier.ts`
- [x] `settlement-trigger.consumer.ts` — seed lockToken, publish первый кик
- [x] `application/settlement-step.consumer.ts` — forward/compensate/beginCompensation/finalizeCancel
- [x] `settlement.module.ts` — wiring

## Test
- [x] happy-path: settled + winner + резерв/инвойс + 2 нотификации + settlement.completed
- [x] compensation: сбой на invoice → откат 3..1, cancelled, settlement.failed(step_failed:invoice)
- [x] no-bids: cancelled без резерва/инвойса, settlement.failed(no_valid_bids)
- [x] exactly-once: повторный settle-кик — no-op
- [x] unit: previousStep, acquireOwned

## Verify
- [x] `pnpm -C apps/api lint`
- [x] `pnpm -C apps/api build`
- [x] `pnpm -C apps/api test`
- [x] `pnpm -C apps/api test:integration` (3 прогона без флейка)
- [x] миграции на `make up`-инфре (run/revert/run)

## Pipeline
- [x] `reviewer` — PASS (suggestion применён: упрощён compensateLock)
- [x] `security-review` — без Critical/High/Medium
- [x] `spec-guardian` — ALIGNED
- [x] `pattern-verifier` — PROVEN
- [x] worklog.md запись + INDEX.md галочка
- [x] отчёт в чат
