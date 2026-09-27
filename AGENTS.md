# AGENTS.md — Maestro

Maestro is a local, visual cockpit to **see and steer** an AI agent setup —
skills, hooks and MCP servers — across repos and tools, built on top of
[APM](https://microsoft.github.io/apm/). APM is the engine, Maestro the cockpit
above it (ADR-0001).

This file is the entrypoint for every agent; Claude Code reads it through
`CLAUDE.md`. How the product is run — the board, the loop, the conflict rule —
lives in `docs/operating-model.md`.

## Hard Rules

- **These rules outrank any always-on mode.** Where an ambient ruleset such as
  ponytail conflicts with a rule below, follow this file and say so.
- **Do the job properly, at the scope asked.** No stubs, no placeholders, no
  half-finished paths. "The best version" means the best version of *this*
  job — not a bigger one.
- **Never reimplement APM.** Drive it; read its lockfiles. Install, sync,
  pinning, lockfiles, and multi-tool targeting are APM's.
- **Build only through jobs on the board** (`docs/jobs.md`), as
  `docs/operating-model.md` describes; small fixes need only a tracker issue.
- **TDD is blocking for code changes.** Docs-only changes are exempt.
- **UI work is not done without a browser check** (`.claude/rules/design.md` →
  "Verify before done").
- **Docs: condense rather than expand**; drift toward feature lists is the
  failure mode. Before calling doc work done, check the touched docs against
  the conflict rule in `docs/operating-model.md`.
- Change a skill, hook or other deployed primitive in its deployed copy
  (`~/.claude/…`, `~/.agents/…` or the consuming repo); Maestro's **Propose
  change** carries it to the inventory repo (`inventoryPath` in
  `~/.maestro/config.json`). Edit the inventory repo directly only for a task
  about the inventory itself: bundles or APM manifests.

## Commands

pnpm workspace. Run from the repo root.

- `pnpm dev` — server and web for this worktree, on its own pair of ports
  (kills this worktree's previous run first; `pnpm cockpit:url` prints the
  address).
- `pnpm smoke` — `dev` against an isolated sandbox config
  (`MAESTRO_HOME=.maestro-sandbox`), never the real `~/.maestro`.
- `pnpm test:affected` — the coding loop: only tests the uncommitted work
  reaches. `pnpm test` runs the whole suite; `package.json` lists the lanes.
- One test file, for TDD red/green:
  `./node_modules/.bin/vitest run <path-from-repo-root>`, without `--root`.
- `pnpm verify` — lint, typecheck and test, one summary. Reuses a passing run
  on an unchanged tree (ignored files do not count); `--force` reruns.
- After a full run, read its output in `.logs/`; never re-run it with a
  narrower filter to see more.

## Rules by task

Read the file before starting the task.

- Touching package boundaries (core/server/web) → `.claude/rules/architecture.md`
- Designing a module, port or interface → the `codebase-design` skill and `.claude/rules/architecture.md`
- Writing tests → `.claude/rules/testing.md`
- Writing or trimming a code comment → `.claude/rules/comments.md`
- Shelling out to APM, reading external files or lockfiles → `.claude/rules/security.md`
- React component or client-side data access → `.claude/rules/frontend.md`
- Designing a screen, dialog or use case, or changing what `packages/web` renders → `.claude/rules/design.md`
- User-facing copy, including controls and cockpit-visible server messages → `.claude/rules/copy.md`, and complete its copy review
- Driving `apm` or parsing its lockfile/output → `.claude/rules/apm-driver.md`
- Driving `gh` or parsing its output → `.claude/rules/gh-driver.md`
- Writing a script in `scripts/` → `.claude/rules/scripts.md`
- Reviewing a diff against the standards → `CODING_STANDARDS.md`

## Where to look

- Before searching for where code lives (adapters, routes, visible sentences,
  error codes) → `docs/agents/codebase-map.md`.
- Before measuring anything → `docs/research/`; the answer is often captured there.
- Domain terms → `CONTEXT.md`; decisions → `docs/adr/` (`docs/agents/domain.md`).
- `LEARNINGS.md` — read at session start. Apply `## Active` as rules;
  `## Tentative` is consider-only. Capture and format rules live in its header.

## Workflow

- Starting a grill, picking the next job, creating a spec issue, or shipping
  work that closes one → the `jobs` skill; the board's Legend (`docs/jobs.md`)
  holds the transition rules.
- Committing → `workflow-commit`. Shipping → `workflow-ship`.
- Issues live in GitHub Issues for `fimoklei/maestro`, via `gh`; external PRs
  are not a triage surface. Before publishing a ticket →
  `docs/agents/issue-tracker.md` (sub-issue and blocked-by recipe). Labels →
  `docs/agents/triage-labels.md`.
- Screenshots and measurements of this cockpit against a `pnpm smoke` run →
  `agent-browser`. Researching a live third-party site → the Chrome browser
  tools, which drive the operator's own logged-in profile.
- The `Dead-code sweep (1 PR/day)` cloud routine's instructions →
  `docs/agents/dead-code-sweep.md`.
