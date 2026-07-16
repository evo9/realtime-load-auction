---
description: Diagnose and fix a failing GitHub Actions CI run
---

You are diagnosing and fixing a CI failure in this repository.

## Input

The user provided: `$ARGUMENTS`
(PR number, run ID, or branch name — if empty, check the current branch)

## Step 1: Find the failing run

```bash
# Get latest CI run for current branch
gh run list --branch $(git rev-parse --abbrev-ref HEAD) --limit 5

# Or for a specific PR
gh pr checks $ARGUMENTS
```

## Step 2: Get failure details

```bash
# View failed job steps
gh run view <run-id> --json jobs --jq '.jobs[] | select(.conclusion=="failure") | {name, steps: [.steps[] | select(.conclusion=="failure") | .name]}'

# Get failure logs
gh run view <run-id> --log-failed
```

## Step 3: Identify failure type

Map the failing job to one of:
- **lint** — `pnpm lint` failure (ESLint, tsc)
- **format** — `pnpm format` formatting issue (Prettier)
- **unit tests** — `pnpm test` failure
- **e2e/concurrency tests** — `pnpm test:e2e` failure
- **build** — compilation error

## Step 4: Fix

For **lint/format failures** — run locally and fix:
```bash
pnpm lint
pnpm format
```

For **test failures** — read the failing test, find the root cause in production code, fix the code (not the test unless the test is wrong).

For **type errors** — check `tsconfig.json` and correct the type issue in the relevant file.

## Step 5: Verify locally

```bash
pnpm lint
pnpm test
# If e2e: pnpm db:up && pnpm migration:run && pnpm test:e2e
```

## Step 6: Report to user

Show:
- Root cause (one sentence)
- Files changed
- Local verification result
- Ask user if they want to commit and push
