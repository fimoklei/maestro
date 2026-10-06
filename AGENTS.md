# AGENTS.md — Maestro

Maestro is a local, visual cockpit to **see and steer** an AI agent setup —
skills, hooks and MCP servers — across repos and tools, built on top of
[APM](https://microsoft.github.io/apm/). APM is the engine, Maestro the cockpit
above it (ADR-0001).

## Hard Rules

- **These rules outrank any always-on mode.** Where an ambient ruleset such as
  ponytail conflicts with a rule below, follow this file and say so.
- **Do the job properly, at the scope asked.** No stubs, no placeholders, no
  half-finished paths. "The best version" means the best version of *this*
  job — not a bigger one.
- **Never reimplement APM.** Drive it; read its lockfiles. Install, sync,
  pinning, lockfiles, and multi-tool targeting are APM's.
- **Build a new capability only through a job issue** (label `job`,
  `docs/operating-model.md`); improving what already exists needs only a
  tracker issue.
- **TDD is blocking for code changes.** Docs-only changes are exempt.
- **UI work is not done without a browser check** (`.claude/rules/design.md` →
  `Verify before "done"`).
- **Docs: condense rather than expand**; drift toward feature lists is the
  failure mode. Before calling doc work done, check the touched docs against
  the conflict rule in `docs/operating-model.md`.
- Change a skill, hook or other deployed primitive in its deployed copy
  (`~/.claude/…`, `~/.agents/…` or the consuming repo); Maestro's **Propose
  change** carries it to the inventory repo (`inventoryPath` in
  `~/.maestro/config.json`). Edit the inventory repo directly only for a task
  about the inventory itself: bundles or APM manifests.

## Rules by task

Read the file before starting the task.

- Touching package boundaries (core/server/web), or designing a module, port or interface → `.claude/rules/architecture.md`; for a design, also the `codebase-design` skill
- Writing or running tests, or `pnpm verify` → `.claude/rules/testing.md`
- Writing or trimming a code comment → `.claude/rules/comments.md`
- Starting a process, using a path from input, parsing an external file or adding an HTTP endpoint → `.claude/rules/security.md`
- React component or client-side data access → `.claude/rules/frontend.md`
- Designing a screen, dialog or use case, or changing what `packages/web` renders → `.claude/rules/design.md`
- Running the cockpit (`pnpm dev`, `pnpm smoke`) → `.claude/rules/design.md` → `Verify before "done"`
- Drafting or proposing user-facing copy — in code, a spec, a ticket or a grill option → `.claude/rules/copy.md`, and complete its copy review
- Driving `apm` or parsing its lockfile/output → `.claude/rules/apm-driver.md`
- Driving `gh` or parsing its output → `.claude/rules/gh-driver.md`
- Writing a script in `scripts/` → `.claude/rules/scripts.md`
- Reviewing a diff against the standards → `CODING_STANDARDS.md`

## Where to look

- Before searching for where code lives (adapters, routes, visible sentences,
  error codes) → `docs/agents/codebase-map.md`.
- Before measuring anything → `docs/research/`.
- Domain terms → `GLOSSARY.md`; decisions → `docs/adr/` (`docs/agents/domain.md`).
- Read `LEARNINGS.md` at session start.

## Workflow

- Committing → `workflow-commit`. Shipping → `workflow-ship`.
- Publishing an issue (job, spec or ticket) → `docs/agents/issue-tracker.md`.
- Researching a live third-party site → the Chrome browser tools, which drive
  the operator's own logged-in profile.
