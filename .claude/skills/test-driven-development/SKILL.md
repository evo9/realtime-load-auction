---
name: test-driven-development
description: >
  Use when writing tests or implementing a feature/bugfix. Pragmatic stance for this project:
  test-first for pure logic (lot state-machine, reverse-auction comparison, idempotency-key
  handling, handler branching, mappers, DTO validation), and integration-proven on real infra
  via testcontainers (Postgres / RabbitMQ / Redis) for the hand-written patterns (outbox, Lua
  CAS, distributed lock, saga + compensations, retry/DLX, scheduler). This is NOT a strict
  test-first mandate — match the technique to the code.
---

# Test-Driven Development (pragmatic)

## Stance for this project
Tests are non-negotiable; *test-first* is a tool, not a law. Match the technique to the code:

- **Pure logic → test-first.** Lot state-machine transitions, reverse-auction comparison direction (lower is better), idempotency-key handling, handler branching, mappers, DTO validation. Write the failing test first — it clarifies the invariant and proves the test actually catches the bug.
- **Hand-written infra → integration-proven.** Outbox, Lua CAS, distributed lock, saga + compensations, retry/DLX, ZSET scheduler. A short spike to learn the real RabbitMQ/Redis/Postgres behaviour is fine; then lock the behaviour with an integration test on real infra (testcontainers). Per the spec (§13): **proven, not declared.**

This fits the pipeline in `workflow.md`: the `test-writer` step may run after `implement`, but pure-logic work should still lead with a failing test where practical.

## The loop (for logic): RED → GREEN → REFACTOR

### RED — write a failing test
One behaviour, clear name, real code over mocks.

Good:
```typescript
test('rejects a bid that is not lower than the current best', async () => {
  const lot = openLot({ best: 1000 });
  const verdict = canAccept(lot, { amount: 1200 });
  expect(verdict).toEqual({ accepted: false, reason: 'too_low' });
});
```

Bad (vague name, asserts a mock instead of behaviour):
```typescript
test('bid works', async () => {
  const repo = { save: jest.fn() };
  await placeBid(repo, {});
  expect(repo.save).toHaveBeenCalled();
});
```

### Verify RED — watch it fail
```bash
pnpm -C apps/api test path/to/file.spec.ts
```
Confirm it fails for the right reason (feature missing, not a typo). A test that passes immediately tests nothing new.

### GREEN — minimal code
Write the simplest code that passes. No speculative options (YAGNI). The one hard line: never "simplify" by reaching for a library the spec excludes (see `CLAUDE.md`) — hand-written infra is the deliverable.

### Verify GREEN — watch it pass
Re-run; the new test and the existing suite are green; output is clean.

### REFACTOR
Improve names, remove duplication, extract helpers. Stay green. Don't add behaviour.

## Good tests
| Quality | Good | Bad |
|---------|------|-----|
| **Minimal** | One behaviour; "and" in the name → split it | `test('validates amount and status and lock')` |
| **Clear** | Name states the behaviour | `test('works')` |
| **Real** | Exercises real code/invariant | Asserts on a mock |

## Real behaviour over mocks
Prefer exercising real code. For infra, use **testcontainers**, not mocks — mocking RabbitMQ/Redis/Postgres proves the mock, not the pattern. See `@testing-anti-patterns.md` for pitfalls (testing mock behaviour, test-only methods on production classes, mocking without understanding dependencies).

## When test-first is awkward (infra spikes)
Exploring the infra first to learn its behaviour is fine. Then:
- Keep the exploration only if it's right; otherwise rewrite it cleanly.
- Add the integration test that pins the invariant — idempotency, exactly-once close/settle, compensation order, Redis→Postgres reconciliation (§6).
- A pattern isn't "done" until a real-infra test proves it.

## Verification checklist (before marking work done)
- [ ] Pure logic has unit tests; you watched the key ones fail first
- [ ] Each infra pattern touched has an integration test on real PG/RMQ/Redis (testcontainers)
- [ ] Tests assert real behaviour/invariants, not mocks or private internals
- [ ] Failure/rollback paths covered, not just the happy path
- [ ] All tests pass; output clean
- [ ] Ran: `pnpm -C apps/api test` (+ `test:e2e`); web tests per app once set up

## When stuck
| Problem | Solution |
|---------|----------|
| Hard to test | Hard to use — simplify the interface, inject ports |
| Must mock everything | Too coupled — use dependency injection |
| Don't know how to assert | Write the wished-for API / assertion first |

Keep tests deterministic — poll/await a condition (see `systematic-debugging/condition-based-waiting.md`), never arbitrary sleeps.
