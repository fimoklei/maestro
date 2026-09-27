# Coding standards

The standards live in `.claude/rules/`. Review a diff against every file whose
scope it touches, and cite the file and the rule.

| Rule file | Scope |
|---|---|
| `architecture.md` | Every change under `packages/` |
| `security.md` | Code that starts a process, takes a path from input, parses an external file, or adds an HTTP endpoint |
| `testing.md` | Every code change (TDD), and every test |
| `comments.md` | Every code comment added or changed |
| `frontend.md` | `packages/web` |
| `design.md` | Anything `packages/web` renders |
| `copy.md` | Every user-facing string, and the server's request-shape messages |
| `apm-driver.md` | Code that drives `apm` or parses its lockfile or output |
| `gh-driver.md` | Code that drives `gh` or parses its output |

## Adding a rule

A rule a linter, a script or a test can check becomes that check
(`scripts/comment-guard.mjs` is the model). A rule file holds only judgement
calls.
