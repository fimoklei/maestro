# AGENTS.md

Canonical context for any agent working in this repo (Claude Code, Codex, Cursor, etc.). Claude Code reads this via `CLAUDE.md`, a thin adapter.

## Repository state

This is the **Maestro product repo** — one of two repos with distinct roles (see `docs/operating-model.md`):

- **`maestro`** (this repo) — the product. `docs/`, `CONTEXT.md`, top-level Markdown = product specification (brief, jobs, roadmap, ADRs). Source of truth. Product code is added later; treat any "implementation" task as premature until a spec calls for it.
- **`agent-harness`** (separate repo) — the central inventory Maestro conducts: skills, hooks, MCP servers, bundles. APM-clean and distributable. You do **not** edit the inventory from here.

## What Maestro is

A visual cockpit to **see and steer** your AI agent setup — skills, hooks, MCP servers — across repos and tools, built on top of APM. APM is the engine (install/sync/pin/lockfile/multi-tool); Maestro is the cockpit above it. See `docs/brief.md`.

**Binding constraint:** APM is the engine; Maestro never reimplements it (ADR-0001).

## Reading order before substantive edits

1. `CONTEXT.md` — glossary
2. `docs/brief.md` — thesis, problem, what Maestro is, MVP1 bet
3. `docs/jobs/job-map.md` — main jobs A–D, MVP1 subjobs J01–J09, parked future subjobs
4. the active `docs/roadmap/NN-*.md` — when one exists (none yet; developed in the roadmap grill)
5. `docs/operating-model.md` — file responsibilities, agent rules
6. accepted ADRs under `docs/adr/` that touch your area

## Decision hierarchy

When documents conflict (from `docs/operating-model.md`):

1. Active roadmap file — active MVP scope
2. `docs/jobs/job-map.md` — canonical job definitions
3. Accepted ADRs in `docs/adr/` — the specific decision they record
4. `CONTEXT.md` — terminology
5. `docs/brief.md` — product strategy and principles
6. `docs/operating-model.md` — process and file responsibilities

Unresolvable conflict → stop and flag. Do not guess.

## Global invariants

Non-negotiable, from `docs/operating-model.md` and ADR-0001:

- **Never reimplement APM.** Drive it; read its lockfiles. Install, sync, pinning, the lockfile, and multi-tool targeting are APM's.
- **Subjob mapping is BLOCKING.** Before any plan or code that alters observable product behavior: name the subjob ID (`J01`–`J09`) from `docs/jobs/job-map.md`. If none was stated, stop and ask. If no subjob fits, propose parking it or call it out-of-scope. Exempt: test infra, build/tooling/CI, dependency bumps, pure internal refactors, meta-docs.
- **Do not build beyond the active MVP.** Future subjobs stay parked in the coverage table; document, don't implement.
- **Solo-first.** Do not build governance, team curation, required/optional scope, adoption dashboards, or the compounding loop in MVP1 (future Jobs C and D).
- **Local-first.** MVP1 delivers value in the local environment before any backend.
- **Inspectable, not magical.** The user must always see what is deployed and where it came from.
- **Two repos, distinct roles.** Product docs/code here; inventory in `agent-harness`. Keep them separate.
- **In scope for MVP1** (note the change from the old model): the three primitive types — **skills, hooks, MCP servers** — and **global** deploy, across **Claude Code and Codex**.
- **TDD is blocking for code changes.** See `.claude/rules/testing.md`. Docs-only changes are exempt.

## Working approach

- When editing docs: prefer condensing over expanding. Drift toward feature lists is the failure mode to watch for.
- Cross-references between docs are explicit (roadmap references job IDs from the job map rather than redefining them). DRY across the spine docs.

## File naming conventions

- **Roadmap files**: `NN-slug.md`. Number for order (never re-used), slug describes the bet, not the MVP number. Created only when scope is committed.
- **ADR files**: `NNNN-slug.md`. Four-digit, assigned in order, never re-used or renumbered. Cross-reference as `ADR-NNNN`.
- **Subjob IDs**: assigned only when a subjob enters an active MVP. Future subjobs listed by name, no ID.
- **Markdown**: plain, direct language. Explicit cross-references over duplicated definitions.

## Verification

Before declaring document work complete, check the hierarchy:

1. Active MVP scope matches the active roadmap file (when one exists).
2. Job IDs and subjob names match `docs/jobs/job-map.md`.
3. Strategy language stays aligned with `docs/brief.md`.
4. Process rules stay aligned with `docs/operating-model.md`.
5. Terms match `CONTEXT.md`.

Useful sanity checks:

- `git status` — confirm edit scope before and after.
- `git diff --check` — catch whitespace errors before committing.
- `rg "J0[1-9]" docs` — inspect MVP1 subjob references.

## Commit & Pull Request Guidelines

Concise conventional-style commits, e.g. `docs: rewrite brief for the cockpit reframe`. For PRs: short summary, list changed files, name which subjob the work maps to, call out intentional out-of-scope items.

## LEARNINGS.md

When `LEARNINGS.md` exists in the repo root: read it at session start. Apply `## Active` entries as rules; for `## Tentative`, consider but do not auto-apply. Append an entry only when a future agent would otherwise re-learn the same thing. Default new entries to `## Tentative`; promote on reconfirmation. Format: `- **YYYY-MM-DD · <area>** — <observation>. → <action>.`
