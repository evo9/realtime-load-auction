# Agent Workflow Orchestration

How to run work on this project. Adapted to our stack (NestJS + Next.js, pnpm, Jest/testcontainers, Playwright) and our agents. Keep `CLAUDE.md`, `docs/specs/load-auction-spec.md`, and the task's `docs/tasks/` file open as the source of truth.

## 1. General rules
- **Plan first** for any non-trivial task (3+ steps or an architectural decision). Use plan mode; write the plan to `docs/todo.md` as checkable items and confirm before implementing.
- If something goes sideways, **stop and re-plan** — don't keep pushing a failing approach.
- **Never mark a task done without proving it works** — build + lint + tests pass, or a demonstrated run. Ask: "would a staff engineer approve this?"
- **Simplicity & minimal impact** — touch only what's necessary, fix root causes, no temporary hacks.
- **The simplicity rule has one hard exception:** never "simplify" by pulling in a library the spec deliberately excludes (`@nestjs/cqrs`, `@nestjs/microservices`, `@golevelup`, `redlock`, `bullmq`, `node-redis`, `passport`, ready-made outbox/saga libs). The hand-written infra IS the deliverable. "More elegant" means cleaner hand-written code, never a shortcut around the patterns.

## 2. Subagents
- Use subagents liberally to keep the main context clean; **one focused task per subagent**. Offload research, exploration, and parallel analysis.
- Roster (model in parens):
  - `architect` (opus) — design & planning, contracts, trade-offs. Doesn't write code.
  - `backend-dev` (sonnet) — implements in `apps/api`.
  - `frontend-dev` (sonnet) — implements in `apps/web`.
  - `test-writer` (sonnet) — per app; jest+testcontainers (api) / RTL+Playwright (web).
  - `reviewer` (opus) — load-auction-reviewer checklist, read-only.
  - `pattern-verifier` (haiku) — runs integration tests, proves a pattern.
  - `spec-guardian` (haiku) — checks names/topology/endpoints vs §8/§10/§3.
- Skills: `engineering:architecture`, `system-design`, `code-review`, `testing-strategy`, `documentation`; `security-review`; the `load-auction-reviewer` skill.

## 3. Feature pipeline
Use when **ANY** applies: new/changed module or command/query handler; a DB migration; new/changed controller, DTO, route, or guard; new/changed Next page or component; auth logic; touches more than 2 files. Skip for a typo or a one-line config change.

1. **Design** — `architect` (or `engineering:architecture` / `system-design`). Output: approach, contracts, failure/compensation paths, ordered steps. Capture significant decisions as an ADR (`docs/adr/`, M6-04).
2. **Implement** — `backend-dev` and/or `frontend-dev`, following the module layers (`api`/`application`/`domain`/`infrastructure`) and the spec. Add the TypeORM migration when schema changes; never auto-sync.
3. **Test** — the app's own `test-writer`. Unit for domain/handlers; **integration on real Postgres/RabbitMQ/Redis (testcontainers)** for infra patterns — proven, not declared. Frontend: RTL + Playwright for the live-lot UX.
4. **Review** — `reviewer` + `engineering:code-review`. Classify Critical / Important / Minor. **Critical or Important → back to steps 2–3** until clean. Minor or clean → proceed.
5. **Security** — `security-review`: auth/authz on guards & DTOs, no secrets/PII in logs, OWASP basics on new endpoints.
6. **Spec & pattern check** — `spec-guardian` (canonical Redis keys / RMQ topology / endpoints / lifecycle) + `pattern-verifier` (run the integration tests for the touched pattern).
7. **Report & PR** — summary + PR via `gh`, **only when the user explicitly asks** (`git-operations.md`: never commit/push unprompted; no AI mentions, no change stats, no test checklists).

## 4. Architecture & infra variants
- Architectural decision or domain modeling → put `architect` before implementation and record an ADR.
- CI/CD, Docker, or deploy changes → treat as infra: design first, verify via the actual workflow run, document in README.

## 5. Bug-fix pipeline (simplified)
1. **Investigate root cause** — `engineering:debug`; use a subagent to sift logs/traces/failing tests.
2. **Fix** — `backend-dev` / `frontend-dev`. Just fix it; point at the evidence, then resolve.
3. **Regression test** — `test-writer` adds a test that fails before, passes after.
4. **Verify** — fix + existing tests pass; `pattern-verifier` if infra is involved.

## 6. Verification toolbox
- api (from repo root): `pnpm -C apps/api lint && pnpm -C apps/api build && pnpm -C apps/api test` (+ `test:e2e`).
- web: `pnpm -C apps/web lint && pnpm -C apps/web build` (+ tests once set up).
- Both at once: `pnpm lint` / `pnpm build` / `pnpm test` (root runner).

## 7. Self-improvement loop
- After **any** correction from the user, append the pattern + a rule that prevents it to `docs/lessons.md`.
- Review `docs/lessons.md` at session start for this project.

## 8. Task tracking
- Plan → `docs/todo.md` (checkable items) → confirm → mark items as you go → short review section at the end.
- High-level summary per step in chat. Progress lives in `docs/todo.md` and the task list — **not** in code comments (see `code-style.md`).
