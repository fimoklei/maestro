# AGENTS.md — Maestro

Canonical operating context for any agent working in this repo (Claude Code,
Codex, Cursor, etc.). Claude Code reads this through `CLAUDE.md`, which is only
an adapter.

Use this file for repo-local agent rules. Use `docs/operating-model.md` for
the product workflow and decision hierarchy.

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
│   ├── brief.md           # product thesis and MVP1 bet
│   ├── operating-model.md # workflow, decision hierarchy, scope rules
│   ├── jobs/job-map.md    # job and subjob definitions
│   ├── adr/               # accepted architecture and product decisions
│   └── roadmap/           # active roadmap files when scope is committed
├── packages/
│   ├── core/              # domain logic
│   ├── server/            # local Hono service
│   └── web/               # React/Vite cockpit UI
├── scripts/               # dev launcher (single-instance; frees ports)
└── tests/                 # acceptance and integration tests
```

## Current implementation shape

Maestro is a local-first client/server web app:

- `packages/core` — framework-free TypeScript domain logic.
- `packages/server` — Hono service that reads local state and drives local
  tools.
- `packages/web` — React/Vite cockpit UI.

Do not add product behavior outside this shape unless a later accepted ADR or
active roadmap changes it.

## Behavioral Rules

### When touching package boundaries (core/server/web) → Read `.claude/rules/architecture.md`
### When writing tests → Read `.claude/rules/testing.md`
### When shelling out to APM or reading external files/lockfiles → Read `.claude/rules/security.md`
### When writing a React component or client-side data access → Read `.claude/rules/frontend.md`
### When driving `apm` or parsing its lockfile/output → Read `.claude/rules/apm-driver.md`
### When committing → Use `workflow-commit`
### When shipping → Use `workflow-ship`

### Hard Rules

- **Do not take shortcuts.** We want the best version possible even if it takes longer.
- **Never reimplement APM.** Drive it; read its lockfiles. Install, sync,
  pinning, lockfiles, and multi-tool targeting are APM's.
- **Follow `docs/operating-model.md`.** It owns reading order, decision
  hierarchy, MVP scope, job mapping, and file naming.
- **TDD is blocking for code changes.** Docs-only changes are exempt.
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
- `pnpm test` — run tests.
- `pnpm typecheck` — typecheck all packages.
- `pnpm build` — build all packages.
- `pnpm lint` — run Biome checks.
- `pnpm format` — format with Biome.

## Verification

Before declaring document work complete, check the touched docs against the
decision hierarchy in `docs/operating-model.md`.

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes

## LEARNINGS.md

When `LEARNINGS.md` exists in the repo root: read it at session start. Apply
`## Active` entries as rules; for `## Tentative`, consider but do not
auto-apply. Append an entry only when a future agent would otherwise re-learn
the same thing. Default new entries to `## Tentative`; promote on
reconfirmation. Format:
`- **YYYY-MM-DD · <area>** — <observation>. → <action>.`
