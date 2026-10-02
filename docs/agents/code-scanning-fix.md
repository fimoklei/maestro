# Code-scanning fix (1 PR/day)

Instructions for the Claude cloud routine of that name on `fimoklei/maestro`.
The routine's Instructions field holds one line pointing here; change the
routine by changing this file through a PR.

You fix open GitHub code-scanning alerts (CodeQL) in the maestro repo: one
alert per run, test-first, merged by you once CI is green. No PR is a fine
outcome.

## Steps

1. Run `pnpm install` from the repo root, then read `AGENTS.md` and
   `.claude/rules/security.md`.
2. Via github-mcp, list the repo's code-scanning alerts with state `open`. None
   → stop and report "No open code-scanning alerts."
3. Via github-mcp, list OPEN pull requests whose head branch starts with
   `fix/code-scanning-`. Each branch name carries the alert number it claims.
   - An open PR whose `verify` and `CodeQL` checks are green: squash-merge it
     now (step 8), then continue.
   - 3 or more still open → stop and report their numbers.
4. Pick the open alert with the highest severity that no open PR claims; break
   ties by lowest alert number. Read the alert's rule help and every flagged
   location.
5. Judge it. A **false positive** (the flagged path is unreachable, or the
   input is trusted per `security.md`) → stop and report the alert number, the
   rule and why, so the operator dismisses it in GitHub. A real defect →
   continue.
6. Fix it test-first, following `.claude/rules/testing.md`:
   - Write the test that goes **red** on the alert's failure (a ReDoS rule: a
     pathological input that must finish within a tight time bound). Run it
     with `./node_modules/.bin/vitest run <path>` and see it fail.
   - Fix the root cause in the shared function every caller routes through,
     keeping behaviour for valid input. See the test go green.
   - An alert in a test file needs no new test; fix the flagged code itself.
   - Run `pnpm verify`. Red → discard all changes and report the alert and
     the failure.
7. Create branch `fix/code-scanning-<alert-number>`, commit
   `fix: <what was wrong> (code scanning #<alert-number>)`, and open a PR
   against main via github-mcp. The PR body states the alert number and rule,
   the root cause, the fix, the test that proves it, and the `pnpm verify`
   result.
8. Wait for the PR's `verify` and `CodeQL` checks to finish.
   - Both green and the alert no longer appears on the PR → squash-merge via
     github-mcp and delete the branch. CodeQL closes the alert on its next
     scan of main.
   - Any red, or the alert still present → leave the PR open, comment the
     failing check or remaining alert, and report it.

## Hard rules

- One new PR per run; one alert per PR.
- Change code only. Leave CodeQL settings, workflows, `docs/`, `AGENTS.md`,
  `CLAUDE.md` and `.claude/` untouched, and leave alert dismissal to the
  operator.
- Merge only a `fix/code-scanning-*` PR you opened, and only through the
  required checks.
- Anything ambiguous → do nothing and report.
