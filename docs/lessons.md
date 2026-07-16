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

## 2026-07-16 — App must not reach outside its own package for config
**Context:** `apps/api` loaded env via `envFilePath: ['.env', '../../.env']`, pointing at the repo-root `.env` shared with docker-compose. Asked to fix the relative path, I only made it cwd-independent (`resolve(__dirname, '../../../..')`) — preserving the escape instead of removing it.
**Mistake:** Treated a boundary violation as a path bug. `apps/api` is declared an independent app (own lockfile, own node_modules); hardcoding that `apps/` and a repo root exist above it breaks the moment the app is extracted or deployed alone. The user caught it, not me.
**Rule:** An app never resolves paths above its own package root. Config comes from `process.env` plus the app's own `.env`; anchor `envFilePath` to the package root via `__dirname`, never to the repo. Root `.env` belongs to docker-compose (provisioning) and app `.env` to the app (connection) — overlapping values locally are not duplication to deduplicate. When asked to fix a symptom, first ask whether the surrounding structure is what's actually wrong.
