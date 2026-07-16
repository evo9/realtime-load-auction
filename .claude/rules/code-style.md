# Code Style — Comments

Code in this repo must read as if written by a competent senior engineer. **Nothing in the code should reveal that an agent wrote it.** When in doubt, write less.

## Never write these (agent fingerprints)
- **Task / spec / milestone references:** `// M3-01`, `// per the spec`, `// see docs/tasks/...`, `// DoD: ...`
- **AI / conversation mentions:** `// as requested`, `// added per your instructions`, `// generated`, anything naming an assistant or the chat
- **Change narration / history:** `// updated`, `// new`, `// changed X to Y`, `// was: ...`, `// refactored from ...`
- **Obvious play-by-play:** `// loop over bids`, `// return the result`, `// inject the service` — restating what the code plainly says
- **Reviewer-directed asides:** comments whose only audience is the person reading this diff right now
- **Leftover stubs:** `// TODO`, `// FIXME`, placeholder comments — unless the user explicitly asked for a stub
- **Commented-out code** — delete it; git has the history

## Allowed — sparingly, only when it earns its place
- A short **"why"** where intent is genuinely non-obvious: a tricky invariant, a deliberate trade-off, the Redis→Postgres reconciliation rationale (§6), the reverse-auction comparison direction
- **JSDoc** on exported/public API when it adds real information beyond the signature
- Comments **inside Lua / CAS scripts** explaining the atomic steps
- `eslint-disable-*` / `@ts-expect-error` only with a concrete reason on the same line

## Default
Prefer self-documenting code — clear names, small functions, precise types — over comments. A comment should explain *why*, never *what*. If a comment restates the code, delete it.

## Also applies to
Commit messages and PR descriptions: no AI mentions, no change statistics, no test-plan checklists (see `git-operations.md`).
