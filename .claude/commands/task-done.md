---
description: Run the code reviewer on recently changed files and fix issues before marking task complete
---

You have just finished implementing a task. Before reporting it as done:

## Step 1: Identify changed files

```bash
git diff --name-only
git ls-files --others --exclude-standard
```

## Step 2: Invoke the reviewer

Use the `load-auction-reviewer` skill. Scope it to the files changed in this task.

Say: "Review the following files: [list changed files]"

## Step 3: Act on findings

- **CRITICAL** — fix immediately, then re-review
- **WARNING** — fix immediately, then re-review  
- **SUGGESTION** — note it, fix if trivial, otherwise leave for later

## Step 4: Confirm completion

Only after the reviewer returns **PASS** or all CRITICAL/WARNING issues are resolved:
- Report the task as done
- Summarise what was implemented and what the reviewer found
