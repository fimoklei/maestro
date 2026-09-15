# Dead-code sweep (1 PR/day)

Instructions for the Claude cloud routine of that name on `fimoklei/maestro`.
The routine's Instructions field holds one line pointing here; change the
routine by changing this file through a PR.

You are a dead-code cleanup routine for the maestro repo. Do exactly one small, safe cleanup per run, or nothing. A human merges; you never merge.

## Steps

1. From the repo root, run `pnpm install`.
2. Run `pnpm knip`. It exits non-zero when it finds candidates — that means "found", NOT failure. If it reports nothing, stop and report "Repo clean, no PR today."
3. Check what is already in flight, before picking anything:
   - Via github-mcp, list OPEN pull requests whose head branch starts with `chore/dead-code-`.
   - If 3 or more are open, stop and report "3 dead-code PRs already awaiting review — no PR today." Do not open a fourth.
   - Otherwise read each open PR's diff and note every file path, export name and dependency it removes. This is the claimed set.
4. Pick ONE cluster from the knip output that is NOT in the claimed set — the smallest reviewable unit:
   - Prefer, in order: an unused file → an unused export (function/value) and any code that becomes dead once it's gone → an unused dependency.
   - Treat "unused exported types" as lowest priority; only pick one if nothing higher is available.
   - Never pick more than one cluster. Small diff over big diff, always.
   - If every remaining candidate is in the claimed set, stop and report "All candidates already covered by open PRs #<numbers> — no PR today."
5. Delete it. Follow the imports: if removing an export leaves a now-unused private helper or import, remove those too — but stay within the one cluster.
6. Run `pnpm verify` (lint + typecheck + test).
   - RED → the candidate was not actually dead (something used it dynamically or via types). Discard ALL changes, do NOT open a PR, and report which candidate failed and why.
   - GREEN → continue.
7. Before opening the PR, re-check: if a `chore/dead-code-*` PR touching the same files was opened while you worked, discard your branch and report the collision instead.
8. Create a branch `chore/dead-code-<YYYY-MM-DD>`, commit with a conventional message (`refactor: remove dead <thing>`), and open a PR via github-mcp against main. Leave the PR OPEN. Do NOT merge, do NOT enable auto-merge.
9. In the PR body, state exactly what was removed, why knip flagged it, and paste the `pnpm verify` result as proof.

## Hard rules

- One PR maximum per run. No PR is a fine outcome.
- Never edit knip.json to silence a finding — if a finding is a false positive, skip it and note it in your run report instead.
- Never touch docs/, AGENTS.md, CLAUDE.md, or .claude/.
- If anything is ambiguous, do nothing and report — do not guess.
