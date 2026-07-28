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

**Binding constraint:** APM is the engine (install/sync/pin/lockfile/multi-tool);
Maestro is the cockpit above it and never reimplements it (ADR-0001).

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
├── packages/
│   ├── core/              # domain logic
│   ├── server/            # local Hono service
│   └── web/               # React/Vite cockpit UI
├── scripts/               # dev launcher (single-instance; frees ports)
└── tests/                 # acceptance and integration tests
```

Do not add product behavior outside this shape unless a later accepted ADR or
a job on the board changes it.

## Behavioral Rules

### When touching package boundaries (core/server/web) → Read `.claude/rules/architecture.md`
### When writing tests → Read `.claude/rules/testing.md`
### When shelling out to APM or reading external files/lockfiles → Read `.claude/rules/security.md`
### When writing a React component or client-side data access → Read `.claude/rules/frontend.md`
### When changing what `packages/web` renders → Read `.claude/rules/design.md`
### When driving `apm` or parsing its lockfile/output → Read `.claude/rules/apm-driver.md`
### When starting a grill or picking the next job → Use the `jobs` skill; the board's Legend (`docs/jobs.md`) holds the transition rules
### When creating a spec issue, or shipping work that closes one → Use the `jobs` skill to record the board transition
### When committing → Use `workflow-commit`
### When shipping → Use `workflow-ship`

### Hard Rules

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
- **Never write to `AGENTS.md`, `CLAUDE.md`, or `.claude/rules/`.** Michiel owns
  them. Quote the lines you would change and wait for his yes.
- When editing docs: prefer condensing over expanding. Drift toward feature lists is the failure mode to watch for.
- When touching code: keep behavior in `packages/core` unless it is genuinely
  transport or UI work. The server and web packages should not become product
  logic catch-alls.
- When a task mentions the inventory, bundles, deployed primitives, or APM
  manifests, check whether it belongs in `agent-harness` instead of this repo.

## Commands

Run from the repo root.

- `pnpm dev` — start server and web (single instance: kills a previous run
  and frees ports 3000/5173 first).
- `pnpm smoke` — same as `dev` but against an isolated sandbox config
  (`MAESTRO_HOME=.maestro-sandbox`), so it never touches the real `~/.maestro`.
- `pnpm test` — whole suite. `test:core` / `test:web` / `test:integration` / `test:acceptance` — one lane.
- `pnpm verify` — lint, typecheck and test as three processes, one summary.
- Full output of the last run is in `.logs/`. Read it; never re-run with a narrower filter.
- `pnpm typecheck` — typecheck all packages.
- `pnpm build` — build all packages.
- `pnpm lint` — run Biome checks.
- `pnpm format` — format with Biome.

## Verification

Before declaring document work complete, check the touched docs against the
conflict rule in `docs/operating-model.md`.

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `fimoklei/maestro` (via the `gh` CLI). External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## LEARNINGS.md

Read `LEARNINGS.md` at session start. Apply `## Active` as rules;
`## Tentative` is consider-only. Capture and format rules live in the file's
own header.
