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

- `CONTEXT.md` — canonical glossary.
- `docs/brief.md` — product thesis and MVP1 bet.
- `docs/operating-model.md` — workflow, decision hierarchy, and scope rules.
- `docs/jobs/job-map.md` — job and subjob definitions.
- `docs/adr/` — accepted architecture and product decisions.
- `docs/roadmap/` — active roadmap files when scope is committed.
- `packages/core` — domain logic.
- `packages/server` — local Hono service.
- `packages/web` — React/Vite cockpit UI.

## Current implementation shape

ADR-0002 makes Maestro a local-first client/server web app:

- `packages/core` — framework-free TypeScript domain logic.
- `packages/server` — Hono service that reads local state and drives local
  tools.
- `packages/web` — React/Vite cockpit UI.

Do not add product behavior outside this shape unless a later accepted ADR or
active roadmap changes it.

## Hard Rules

- **Never reimplement APM.** Drive it; read its lockfiles. Install, sync,
  pinning, lockfiles, and multi-tool targeting are APM's.
- **Follow `docs/operating-model.md`.** It owns reading order, decision
  hierarchy, MVP scope, job mapping, and file naming.
- **TDD is blocking for code changes.** Docs-only changes are exempt.

## Working approach

- When editing docs: prefer condensing over expanding. Drift toward feature lists is the failure mode to watch for.
- When touching code: keep behavior in `packages/core` unless it is genuinely
  transport or UI work. The server and web packages should not become product
  logic catch-alls.
- When a task mentions the inventory, bundles, deployed primitives, or APM
  manifests, check whether it belongs in `agent-harness` instead of this repo.

## Commands

Run from the repo root.

- `pnpm dev` — start server and web.
- `pnpm test` — run tests.
- `pnpm typecheck` — typecheck all packages.
- `pnpm build` — build all packages.
- `pnpm lint` — run Biome checks.
- `pnpm format` — format with Biome.

## Verification

Before declaring document work complete, check the touched docs against the
decision hierarchy in `docs/operating-model.md`.

## Commit & Pull Request Guidelines

Concise conventional-style commits, e.g. `docs: rewrite brief for the cockpit reframe`.
For PRs: short summary, list changed files, name the mapped subjob or say why
the change is exempt, and call out intentional out-of-scope items.

## LEARNINGS.md

When `LEARNINGS.md` exists in the repo root: read it at session start. Apply
`## Active` entries as rules; for `## Tentative`, consider but do not
auto-apply. Append an entry only when a future agent would otherwise re-learn
the same thing. Default new entries to `## Tentative`; promote on
reconfirmation. Format:
`- **YYYY-MM-DD · <area>** — <observation>. → <action>.`
