# Lessons

Running log of corrections and the rules they produced, so the same mistake isn't repeated. Append a new entry after any correction from the user. Review at session start.

Format per entry:

```
## YYYY-MM-DD — <short title>
**Context:** what was being done
**Mistake:** what went wrong
**Rule:** the preventing rule, phrased as an instruction to follow next time
```

---

<!-- entries below, newest first -->

## 2026-07-16 — Record the task the moment it's done, never at the start of the next one
**Context:** M1-03 was finished but `docs/worklog.md` had no entry and `INDEX.md` still showed `- [ ]`. The recording kept happening later — backfilled at the start of the following task.
**Mistake:** Not laziness but a contradiction in the instructions. §3 step 7 said logging "needs no prompting", while §8, `worklog.md` and the root `CLAUDE.md` all said the entry is "written in `/task-done` step 5". Three places out of four bound recording to a user-invoked slash command, so the pipeline waited for a trigger that never came; §8's "read worklog at session start" then surfaced the gap and it got patched retroactively.
**Rule:** Recording is a consequence of finishing, not a step of an optional command. The worklog entry and the `INDEX.md` tick land the moment the reviewer returns PASS and **before** the completion summary in chat — the last action of the task, not the first of the next. Never backfill silently: an unlogged finished task means running the closing pipeline again, or saying so out loud. More generally: when the same rule is stated in several files, make them agree — an agent will resolve the contradiction the cheapest way, not the intended way.

## 2026-07-16 — App must not reach outside its own package for config
**Context:** `apps/api` loaded env via `envFilePath: ['.env', '../../.env']`, pointing at the repo-root `.env` shared with docker-compose. Asked to fix the relative path, I only made it cwd-independent (`resolve(__dirname, '../../../..')`) — preserving the escape instead of removing it.
**Mistake:** Treated a boundary violation as a path bug. `apps/api` is declared an independent app (own lockfile, own node_modules); hardcoding that `apps/` and a repo root exist above it breaks the moment the app is extracted or deployed alone. The user caught it, not me.
**Rule:** An app never resolves paths above its own package root. Config comes from `process.env` plus the app's own `.env`; anchor `envFilePath` to the package root via `__dirname`, never to the repo. Root `.env` belongs to docker-compose (provisioning) and app `.env` to the app (connection) — overlapping values locally are not duplication to deduplicate. When asked to fix a symptom, first ask whether the surrounding structure is what's actually wrong.
