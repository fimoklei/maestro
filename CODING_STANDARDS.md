# Coding standards

The entrypoint for writing and reviewing code: the gates, the architecture, the
checks, and which file in `.claude/rules/` holds the rules for each task.

- **TDD (`/tdd`) is blocking for code changes:** no Edit or Write to code
  without RED first. Docs-only changes are exempt.
- **UI work is done after a browser check** (the `verify-ui` skill).

## Rule files by task

When a rule file's text is not in your context, read it with the Read tool,
not the shell, before starting the task.

- Designing a module, port or interface → the `codebase-design` skill and
  Architecture below
- Writing or running tests, or `pnpm verify` → `testing.md`
- Writing or trimming a code comment → `comments.md`
- Starting a process, using a path from input, parsing an external file or adding an HTTP endpoint → `security.md`
- React component or client-side data access → `frontend.md`
- Writing or changing a string the cockpit shows → `copy.md`
- Changing what `packages/web` renders → `design.md`, read whole; before calling it done, the `verify-ui` skill
- Driving `apm` or parsing its lockfile/output → `apm-driver.md`
- Driving `gh` or parsing its output → `gh-driver.md`
- Driving `git`, or building a git test remote → `git-driver.md`
- Writing a script in `scripts/` → `scripts.md`

**Reviewing a diff:** review against this file and every rule file whose
`paths:` matches a changed file. Cite the file and the rule. A commit that
changes what `packages/web` renders and lists no browser check in its body is
a finding (`verify-ui` skill).

**Reviewing a rule change:** when a diff changes `.claude/rules/**`,
`AGENTS.md` or this file, read every other rule file. A new rule that
contradicts one, and a `paths:` change that stops a rule loading for files its
text names, are findings.

## Architecture

### The three layers

- **`core` — the brains.** Domain model, drift, ports, and the adapters that implement them. Node built-ins (`node:fs`, `node:child_process`) only behind a port. No React, no Hono, no HTTP, no JSX. Product behavior lives here.
- **`server` — the plumbing.** Transport only: Hono routes, Zod at the edge, delegate to `core`. No domain logic, no drift math, no business rules.
- **`web` — the screen.** UI only: React, talks to `server` over HTTP. Never touches the filesystem, never shells out.

Direction: `web` → HTTP → `server` → `core`. Never the reverse. `core` depends on nothing else in this repo.

**`web` imports `core` types; it never copies them.** A value comes from `server` over HTTP.

### Ports & adapters

- Outside-world access (filesystem, `apm` CLI, git) sits behind a **port** (an interface) in `core`.
- Pure logic depends on the port, not the concrete adapter.
- Adapters live in `core`, not `server`.
- Test split (`testing.md`): pure logic → sibling unit tests; adapters → `tests/integration/`.

### Validation

- Validate where data crosses a trust boundary: HTTP requests in `server`, and any parse of external data (lockfiles, `apm.yml`, `apm` output).
- Order: normalize → validate with Zod → pass typed data inward.
- Inside `core`, data is trusted; the boundary already checked it.
- Derive a validated shape's type from its schema (`z.infer`; `z.input` or
  `z.output` when a transform changes the shape). Never keep a hand-written
  twin type.
- Untrusted-input specifics → `security.md`.
- Give every `as` cast a reason a reviewer can check. A cast on a copy table or
  a notice needs a test that renders its result.

### Function signatures

- Scrutinise every optional parameter. A caller that omits it gets the default silently; prefer a required parameter over backwards compatibility.

## Checks

| Rule | Enforced by |
| --- | --- |
| Typecheck, lint and affected tests pass before a commit | commit gate (`~/.claude/hooks/commit-gate.py`); `verify` in CI |
| A commit that removes a test case says why (`Tests-removed:`) | commit gate |
| Code comments cite no ADR, story ID, home path or workshop document | `comment-guard` in `pnpm lint` |
| Shipped strings use no retired screen word | `copy-guard` in `pnpm lint` |
| Feature code takes status, colour, icon, toast and checkbox from `ui/` | `design-guard` in `pnpm lint` |
| Every rule file has a `paths:` that matches a file | `rules-guard` in `pnpm lint` |
| A source file stays under 800 lines | Biome in `pnpm lint` |

Run from the repo root:

- `pnpm test:affected` while building: the tests of the three cheap lanes that
  the uncommitted work reaches, selected as the commit gate selects them.
  After merging branches, `pnpm test:affected --since origin/main`.
  `pnpm test:loop` runs those three lanes whole; `pnpm test` runs all four.
- CI runs the full suite on the pull request, so skip `pnpm test` locally
  unless asked. A sub-agent brief repeats this line instead of naming its own
  test commands.
- Lint fails on formatting → `pnpm format`.

## Adding a rule

When the operator corrects a mistake in code, add its rule here or in its rule
file. For a rule a linter, a script or a test can check, propose that check
(`scripts/comment-guard.mjs` is the model), add it once the owner approves, and
list it under Checks. A contract test that reads source files is such a check
when the rule binds source to rendered behaviour (`dialog-contract.test.tsx` is
the model); review it as a check, not a breach. A rule file holds only
judgement calls. Scope a new rule file with `paths:`.
