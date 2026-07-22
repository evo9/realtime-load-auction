# M4-03 — Retry/DLX: экспоненциальный ретрай + dead-letter

План: /Users/evo/.claude/plans/fluttering-floating-rain.md

## Implement
- [x] `platform/messaging/retry-backoff.ts` — `computeRetryDelayMs`
- [x] `base.consumer.ts` — использовать вынесенную функцию + логирование (retry/dlq/unparsable)
- [x] `retry-dlq.integration-spec.ts` — +кейс на `listing.q`

## Test
- [x] `retry-backoff.spec.ts` — рост задержки, точные значения, капается на max

## Verify
- [x] `pnpm -C apps/api lint`
- [x] `pnpm -C apps/api build`
- [x] `pnpm -C apps/api test`
- [x] `pnpm -C apps/api test:integration` (2 прогона без флейка)

## Pipeline
- [x] `reviewer` — PASS
- [x] `security-review` — без Critical/High/Medium
- [x] `spec-guardian` — ALIGNED
- [x] `pattern-verifier` — PROVEN
- [x] worklog.md + INDEX.md
- [x] отчёт в чат
