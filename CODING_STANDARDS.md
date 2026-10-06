# Coding standards

The entrypoint for writing and reviewing code. The standards live in
`.claude/rules/`.

- **TDD is blocking for code changes.** Docs-only changes are exempt.
- **UI work is done after a browser check** (`design.md` → `Verify before "done"`).

## Rule files by task

Read the file before starting the task.

- Touching package boundaries (core/server/web), or designing a module, port or interface → `architecture.md`; for a design, also the `codebase-design` skill
- Writing or running tests, or `pnpm verify` → `testing.md`
- Writing or trimming a code comment → `comments.md`
- Starting a process, using a path from input, parsing an external file or adding an HTTP endpoint → `security.md`
- React component or client-side data access → `frontend.md`
- Changing what `packages/web` renders → `design.md`
- Driving `apm` or parsing its lockfile/output → `apm-driver.md`
- Driving `gh` or parsing its output → `gh-driver.md`
- Writing a script in `scripts/` → `scripts.md`

**Reviewing a diff:** review against every rule file whose `paths:` matches a
changed file, and every rule file without `paths:`. Cite the file and the rule.

## Adding a rule

For a rule a linter, a script or a test can check, propose that check
(`scripts/comment-guard.mjs` is the model) and add it once the owner approves.
A contract test that reads source files is such a check when the rule binds
source to rendered behaviour (`dialog-contract.test.tsx` is the model); review
it as a check, not a breach. A rule file holds only judgement calls. Scope a
new rule file with `paths:`; `pnpm rules-guard` fails a pattern that matches
no file.
