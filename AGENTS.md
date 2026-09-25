# AGENTS.md — Maestro

Canonical operating context for any agent working in this repo (Claude Code,
Codex, Cursor, etc.). Claude Code reads this through `CLAUDE.md`, which is only
an adapter.

Use this file for repo-local agent rules. Use `docs/operating-model.md` for
how the product is run (the board, the loop, the conflict rule).

## What Maestro is

A visual cockpit to **see and steer** your AI agent setup — skills, hooks, and
MCP servers — across repos and tools, built on top of
[APM](https://microsoft.github.io/apm/). This is the Maestro product repo; the
central inventory lives in the separate `agent-harness` repo.

**Binding constraint:** APM is the engine, Maestro the cockpit above it
(ADR-0001; the Hard Rules say what that forbids).

## Where Things Live

```text
.
├── AGENTS.md              # repo-local agent entrypoint
├── CLAUDE.md              # Claude Code adapter; imports AGENTS.md
├── LEARNINGS.md           # project-specific agent learnings
├── CONTEXT.md             # canonical glossary
├── .claude/rules/         # Claude-specific project rules
├── docs/
│   ├── brief.md           # product thesis and the bet
│   ├── operating-model.md # how the product is run: the board and the loop
│   ├── jobs.md            # the board: NOW / NEXT / LATER / DONE
│   ├── adr/               # accepted architecture and product decisions
│   ├── agents/            # how agents drive this repo's tools and trackers
│   ├── research/          # measured findings, named by the issue that asked
├── packages/              # core (domain logic), server (Hono), web (React/Vite)
│   └── */src/<feature>/   # one dir per domain feature: deploy, drift, registry…
├── scripts/               # dev launcher (single-instance; frees ports)
└── tests/                 # integration tests, fixtures and helpers
```

Do not add product behavior outside this shape unless a later accepted ADR or
a job on the board changes it. Before measuring anything, read `docs/research/`
— the answer is often already captured there.

The harness the cockpit reads is not in this repo. Its path is `inventoryPath`
in `~/.maestro/config.json`.

### Where to look first

- **Adapter wiring** (which real class backs a port): `realDeps()` in
  `packages/server/src/app.ts`. Routes: `packages/server/src/routes/<feature>-routes.ts`.
- **Harness git** port and `HarnessGitAdapter`: `packages/core/src/harness/harness-git.ts`;
  there is no `-adapter` file. `gh`: `gh-cli-adapter.ts` beside it.
- **Visible sentences**: `packages/web/src/<feature>/*-copy.ts` (`busy-copy.ts` in `ui/`).
  Grep those modules first.
- **Harness strip status text**: `packages/web/src/harness/harness-view-model.ts`;
  `harness-view.tsx` only renders it.
- **Error code** → status: `packages/server/src/error-responses.ts`; → sentence:
  `packages/web/src/<feature>/notice-copy.ts`, keyed by the same code.

## Behavioral Rules

### When touching package boundaries (core/server/web) → Read `.claude/rules/architecture.md`
### When writing tests → Read `.claude/rules/testing.md`
### When shelling out to APM or reading external files/lockfiles → Read `.claude/rules/security.md`
### When writing a React component or client-side data access → Read `.claude/rules/frontend.md`
### When designing a screen, dialog or use case, or changing what `packages/web` renders → Read `.claude/rules/design.md`
### When authoring or reviewing user-facing copy, including controls and cockpit-visible server messages → Read `.claude/rules/copy.md` and complete its copy review
### When driving `apm` or parsing its lockfile/output → Read `.claude/rules/apm-driver.md`
### When driving `gh` or parsing its output → Read `.claude/rules/gh-driver.md`
### When starting a grill or picking the next job → Use the `jobs` skill; the board's Legend (`docs/jobs.md`) holds the transition rules
### When creating a spec issue, or shipping work that closes one → Use the `jobs` skill to record the board transition
### When committing → Use `workflow-commit`
### When shipping → Use `workflow-ship`

### Hard Rules

- **These rules outrank any always-on mode.** Where an ambient ruleset such as
  ponytail conflicts with a rule below, follow this file and say so.
- **Do the job properly, at the scope asked.** No stubs, no placeholders, no
  half-finished paths. "The best version" means the best version of *this*
  job — not a bigger one.
- **Never reimplement APM.** Drive it; read its lockfiles. Install, sync,
  pinning, lockfiles, and multi-tool targeting are APM's.
- **Follow `docs/operating-model.md`.** It owns the board, the loop, and the
  conflict rule. Build only through jobs on the board (`docs/jobs.md`); small
  fixes need only a tracker issue.
- **TDD is blocking for code changes.** Docs-only changes are exempt.
- **UI work is not done without a browser check** (`.claude/rules/design.md` →
  "Verify before done").
- When editing docs: prefer condensing over expanding. Drift toward feature lists is the failure mode to watch for.
- When touching code: keep behavior in `packages/core` unless it is genuinely
  transport or UI work. The server and web packages should not become product
  logic catch-alls.
- When a task mentions the inventory, bundles, deployed primitives, or APM
  manifests, check whether it belongs in `agent-harness` instead of this repo.

## Commands

Run from the repo root.

- `pnpm dev` — start server and web for this worktree, on its own pair of ports
  (kills this worktree's previous run first; `pnpm cockpit:url` prints the
  address).
- `pnpm smoke` — same as `dev` but against an isolated sandbox config
  (`MAESTRO_HOME=.maestro-sandbox`), so it never touches the real `~/.maestro`.
- `pnpm test` — whole suite. `test:core` / `test:web` / `test:integration` / `test:git` — one lane; `test:affected` — the coding loop: only tests the uncommitted work reaches; `test:loop` — the three cheap lanes whole.
- `pnpm verify` — lint, typecheck and test as three processes, one summary.
  On a tree that already passed it reuses that run (ignored files do not count); `--force` runs it again.
- Full output of the last run is in `.logs/`. Read it; never re-run with a narrower filter.
- `typecheck`, `build`, `lint` and `format` do what their names say; `package.json` holds the rest.

## Verification

Before declaring document work complete, check the touched docs against the
conflict rule in `docs/operating-model.md`.

## Browser Automation

- Verifying what this cockpit renders — screenshots and measurements against a
  `pnpm smoke` run → `agent-browser` (`agent-browser --help`).
- Researching a live third-party site → the Chrome browser tools, which drive
  the operator's own profile and so reach sites behind a login.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `fimoklei/maestro` (via the `gh` CLI). External PRs are not a triage surface. Read `docs/agents/issue-tracker.md` before publishing tickets: it holds the sub-issue and blocked-by recipe.

### Triage labels

Default vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Cloud routines

The instructions of the `Dead-code sweep (1 PR/day)` routine live in `docs/agents/dead-code-sweep.md`.

## LEARNINGS.md

Read `LEARNINGS.md` at session start. Apply `## Active` as rules;
`## Tentative` is consider-only. Capture and format rules live in the file's
own header.
