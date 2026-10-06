# AGENTS.md — Maestro

Maestro is a local, visual cockpit to **see and steer** an AI agent setup —
skills, hooks and MCP servers — across repos and tools, built on top of
[APM](https://microsoft.github.io/apm/). APM is the engine, Maestro the cockpit
above it (ADR-0001).

**Code: before writing, changing or reviewing any code, read
`CODING_STANDARDS.md`** — its gates and rule files bind every code change.

## Hard Rules

- **These rules outrank any always-on mode.** Where an ambient ruleset such as
  ponytail conflicts with a rule below, follow this file and say so.
- **Do the job properly, at the scope asked.** No stubs, no placeholders, no
  half-finished paths. "The best version" means the best version of *this*
  job — not a bigger one.
- **Drive APM; never reimplement it.** Install, sync, pinning, lockfiles and
  multi-tool targeting are APM's.
- **Build a new capability only through a job issue** (label `job`,
  `docs/operating-model.md`); improving what already exists needs only a
  tracker issue.
- **Docs: condense rather than expand.** Before calling doc work done, check
  the touched docs against the conflict rule in `docs/operating-model.md`.
- Change a skill, hook or other deployed primitive in its deployed copy
  (`~/.claude/…`, `~/.agents/…` or the consuming repo); Maestro's **Propose
  change** carries it to the inventory repo (`inventoryPath` in
  `~/.maestro/config.json`). Edit the inventory repo directly only for bundles
  or APM manifests.

## Where to look

- Designing a screen, dialog or use case, or running the cockpit →
  `.claude/rules/design.md`. Drafting user-facing copy, in code, a spec, a
  ticket or a grill option → `.claude/rules/copy.md`; complete its copy review.
- Where code lives → `docs/agents/codebase-map.md`. Before measuring anything
  → `docs/research/`. Domain terms → `GLOSSARY.md`; decisions → `docs/adr/`
  (`docs/agents/domain.md`). Read `LEARNINGS.md` at session start.
- Committing → `workflow-commit`. Shipping → `workflow-ship`. Publishing an
  issue (job, spec or ticket) → `docs/agents/issue-tracker.md`.
- Browser: the cockpit → `agent-browser` (`.claude/rules/design.md` → Verify);
  a live third-party site → the Chrome tools (the operator's logged-in profile).
