---
name: load-auction-reviewer
description: >
  Code review skill for the Real-time Load Auction project (NestJS modular monolith +
  RabbitMQ + Redis + Postgres). Use this skill whenever the user asks to review, check, or
  validate code in this project — even casually: "does this look right?", "check the hot path",
  "is the outbox correct?", "review my saga", "review what I just wrote", "ревью",
  "проверь код", "посмотри на мой код", "проверь горячий путь". It enforces the project's
  deliberate architecture: modular monolith, CQRS-lite WITHOUT @nestjs/cqrs, hand-written
  infra patterns (outbox, idempotency, distributed lock, Lua CAS, rate-limit, saga, RabbitMQ
  topology), outbox→RabbitMQ + durable saga (no in-memory bus), Postgres as source of truth
  with optimistic locking, Redis high-bid as a reconciled candidate, reverse-auction
  comparison (lower is better), and clean layer separation (domain has no framework imports).
  Produces a structured report with CRITICAL / WARNING / SUGGESTION severity and exact
  file:line references.
---

# Real-time Load Auction — Code Reviewer

You are a senior engineer who knows this codebase inside out. You review code against the architecture defined in `CLAUDE.md` (root + `apps/api/CLAUDE.md` + `apps/web/CLAUDE.md`) and `docs/specs/load-auction-spec.md`. Reviews are precise, cite exact `file:line`, and suggest concrete fixes — not vague advice.

**These design decisions are intentional. Never flag them as "could be simpler" or suggest a library the spec deliberately excludes.** The hand-written infra patterns ARE the point of the project.

## Step 1 — Determine scope

If the user names files or a module/layer, review those. Otherwise infer from context:
- "review auction" / lifecycle → `apps/api/src/modules/auction/`
- "review bidding" / "hot path" / "ставка" → `apps/api/src/modules/bidding/`
- "review settlement" / "saga" → `apps/api/src/modules/settlement/`
- "review notification / realtime / listing / identity" → `apps/api/src/modules/<name>/`
- "review platform" / "outbox" / "messaging" / "redis" / "scheduler" → `apps/api/src/platform/`
- "review the frontend" / web → `apps/web/src/`
- "review everything" → all of the above

**Always read the actual files before commenting.** Use Read and Grep. Never review from memory. Skip checklist sections that have no files in scope.

---

## Step 2 — Run the checklist

### 🔴 CRITICAL — Architecture violations

Showstoppers. Must be fixed before merge.

#### C1. No `@nestjs/cqrs` — CQRS-lite is a principle, not a library
The project forbids the `@nestjs/cqrs` machinery. Command/query handlers are plain `@Injectable` services; the controller calls them directly (or via a thin facade).

Grep across `apps/api/src/`:
- `@nestjs/cqrs` → forbidden import
- `CommandBus|QueryBus|EventBus` → forbidden in-process bus
- `@CommandHandler|@QueryHandler|@EventsHandler|ICommandHandler|IQueryHandler` → forbidden decorators/interfaces
- rxjs-based `Saga` / `ofType(` from cqrs → forbidden

#### C2. No forbidden infra wrappers / ready-made pattern libs
The infra patterns are hand-written on top of `pg` / `ioredis` / `amqplib`. Flag:
- `@nestjs/microservices` or `@golevelup/nestjs-rabbitmq` → topology must be hand-written via `amqplib` + `amqp-connection-manager`
- `node-redis` / `import .* from 'redis'` → must be `ioredis` (Lua/CAS via `defineCommand`)
- ready-made libs for the demonstrated patterns: `redlock`, `bullmq`/`bull`/`bee-queue` (scheduler), `nestjs-idempotency`, any outbox/saga library
- `passport` / `@nestjs/passport` → JWT uses `@nestjs/jwt` only

#### C3. No in-memory event bus — outbox→RabbitMQ + durable saga only
The event backbone must survive restart. Flag any `EventEmitter2` / `@nestjs/event-emitter` / in-process emitter used as a **workflow** bus (a step that can fail/lag). Synchronous in-process calls between modules are allowed only for non-workflow reads.

#### C4. Outbox — no dual-write
The event row must be written in the **same DB transaction** as the state change (§5, §6). Flag:
- a command handler publishing to RabbitMQ directly (e.g. `publisher.publish(...)`) instead of writing an `outbox` row
- `outbox.add(...)` executed outside the `UnitOfWork` transaction that mutates state
- relay marking published before the publish confirm

#### C5. Postgres is source of truth; Redis high-bid is a candidate
- Lot state changes must bump `version` (optimistic lock) and handle the version-mismatch path.
- `lot:{id}:high` in Redis is a **candidate**, reconciled from the DB (§6). Flag any code that treats Redis as the authoritative winner without DB reconciliation, or that reads the winner for settlement from Redis instead of Postgres.

#### C6. Close / settle exactly once
`CloseLot` and the settlement saga must take a **distributed lock** (`lot:{id}:lock`, `SET NX` + token + Lua release) AND consumers must be idempotent (dedup by `messageId`). Flag a close/settle path missing either guard.

#### C7. Idempotency on two levels
- Hot-path `POST /lots/:id/bids` must require and honor `Idempotency-Key` (`SET NX idem:{key}`, replay returns cached result).
- Every RMQ consumer must dedup by `messageId` (`msg:dedup:{messageId}`) before processing. Flag a consumer that processes before the dedup check.

#### C8. Reverse-auction comparison direction
A new bid is better when it is **lower**. In the Lua CAS and in DB comparisons, the "beats current" check must use the favorability direction (lower wins). Flag a `>=`/`>` where a lower-is-better comparison is required (§8.3 — "reverse auction: лучше = меньше").

#### C9. CAS atomicity
Accepting a high-bid must be an atomic Lua compare-and-set ("accept only if better AND lot is open"), executed via `evalsha`. Flag a read-then-write in JS (GET high → compare → HSET) — that's a race.

#### C10. Layer purity
- `domain/` is pure TypeScript: zero `@nestjs/*`, zero `typeorm` imports, no ORM decorators (`@Entity|@Column|@VersionColumn|...`), no aggregates/value-objects (domain = types + explicit state-machine).
- `domain/` must not import `application/` or `infrastructure/`.
- Domain modules must not import `platform/*` internals — only the platform modules' public providers.

Grep inside the relevant `domain/` dir: `import .*typeorm`, `import .*@nestjs`, `@Entity|@Column|@VersionColumn`, `import .*infrastructure`, `import .*application`.

---

### 🟡 WARNING — Convention violations

Degrade quality / invite future bugs, but don't break the architecture immediately.

#### W1. Hot-path order (§6)
`PlaceBidHandler` must follow: (1) idempotency `begin` → (2) Lua CAS fast-reject → (3) Postgres TX: insert bid + bump `lot.version` + `outbox.add('bid.placed')` → (4) `idempotency.complete`. Flag any DB write before the CAS reject, or `bid.placed` published outside the outbox.

#### W2. Backpressure on consumers
Each consumer sets prefetch/QoS, has bounded concurrency, and routes failures through TTL-retry (`auction.retry`) → after N attempts → `auction.dlx` → `<name>.dlq`. Flag a consumer with no prefetch or no DLQ wiring.

#### W3. Explicit state-machine transitions
Lifecycle `draft→scheduled→open→closing→settled` (+`→cancelled`) goes through a transition validator. Flag direct `lot.status = ...` assignments that bypass the validator or perform an illegal transition.

#### W4. Scheduler durability
Delayed open/close lives in a Redis **ZSET** (`auction:schedule:open|close`) so it survives restart; `@nestjs/schedule`/`setInterval` is only the tick loop. Flag `setTimeout`/in-memory timers used to open/close lots. Anti-snipe extension = re-`zadd` (score update).

#### W5. Query path doesn't repeat write ceremony
Query handlers hit the read-model/repository directly and return a DTO (§4.1). Flag a read path loading domain types or going through the write-side UoW/outbox.

#### W6. JWT auth shape
Auth guard built on `@nestjs/jwt` (see C2). DTO validation via `class-validator`/`class-transformer` at the `api/` boundary. Flag controllers accepting unvalidated bodies on write paths.

#### W7. Relative-path imports
If/when the `@src/*` alias is configured, imports inside `apps/api/src/` should use it. Flag `from '../..'` chains (`grep -rn "from '\.\." apps/api/src/`). Soft until the alias lands.

---

### 🔵 SUGGESTION — Quality & principles

Flag, but don't block merge.

#### S1. Patterns proven, not declared
Infra patterns (outbox, CAS, distributed lock, saga, retry/DLX, scheduler) should be covered by **integration tests on real Postgres/RMQ/Redis** via `@testcontainers/*`. Flag a pattern implementation with only unit-mock coverage.

#### S2. Canonical infra names (§8)
Redis keys: `idem:{key}`, `msg:dedup:{messageId}`, `lot:{id}:high`, `lot:{id}:status`, `lot:{id}:lock`, `auction:schedule:open|close`, `ratelimit:{carrier}:{lot}`. RMQ: exchanges `auction.events` (topic), `settlement.commands` (direct), `auction.retry`, `auction.dlx`; queues `notification.q`, `settlement.q`, `listing.q`, `settlement.steps.q`, `<name>.dlq`. Flag deviations from these names.

#### S3. Saga shape
Compensations run in reverse order on failure after N retries (+ `lot.status = cancelled`); saga state persisted in `saga_instances` (`lotId`, `step`, `status`, `payload`). No valid bids → straight to `cancelled`. Notifications stay idempotent.

#### S4. Simplicity & observability
No speculative abstractions between handler and repository. Structured logging (`nestjs-pino`) with request/correlation id. Business rate-limit (Redis sliding window) is separate from HTTP throttle (`@nestjs/throttler`).

#### S5. Git/PR hygiene (when preparing a PR)
Per `.claude/rules/git-operations.md`: never mention AI tools, no change statistics, no test-plan checklists; never commit/push without explicit request.

---

## Step 3 — Write the report

Use this exact structure. Never omit a section — write "None found ✅" if clean.

```
## Code Review: <scope reviewed>

### Summary
<2–3 sentences: overall quality, biggest concern, verdict direction>

---

### 🔴 Critical Issues
[None found ✅ — or list issues]

#### `path/to/file.ts:42` — Short title
**What the code does:** ...
**Why it's wrong:** ...  (cite the rule, e.g. "C4 — dual-write")
**Fix:**
\`\`\`typescript
// corrected snippet
\`\`\`

---

### 🟡 Warnings
[None found ✅ — or list issues]

#### `path/to/file.ts:17` — Short title
...

---

### 🔵 Suggestions
[None found ✅ — or list suggestions]

---

### Verdict
**PASS** / **PASS WITH WARNINGS** / **NEEDS REVISION**

<One sentence on what must change before this is done, or confirmation it's ready>
```

**Verdict rules:**
- `PASS` — zero criticals, zero warnings
- `PASS WITH WARNINGS` — zero criticals, has warnings (mergeable, fix soon)
- `NEEDS REVISION` — any critical issue present

## What makes a good review
- Cite exact `file:line` and the rule id (C/W/S) for every issue. Vague references are useless.
- Give a concrete fix snippet when the fix isn't obvious.
- Don't invent issues — if nothing is wrong after checking, say so.
- Don't lecture on generic NestJS/DDD theory; say what's broken in *this* code.
- Never suggest replacing a hand-written pattern with a library the spec excludes — that's the project's whole point.
- Brevity over padding.
