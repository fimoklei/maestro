# Maestro

**A visual cockpit to see and steer your AI agent setup — skills, hooks, and MCP servers — across your repositories and tools, built on top of [APM](https://microsoft.github.io/apm/).**

APM solved distribution (install, sync, pinning, lockfile, multi-tool). It has no visibility or control surface, so after adoption you cannot answer *"what do I have centrally, and what is deployed where?"* Maestro is that cockpit.

- **See** — your central inventory, and what is deployed where (per repo and global, with versions and drift).
- **Steer** — compose bundles and deploy or update primitives, locally or globally, for Claude Code and Codex.
- **Curate** (future) — turn team contributions and repeated corrections into production-ready central capabilities.

APM is the engine; Maestro is the cockpit. Maestro never reimplements APM — it reads its lockfiles and drives it. See [ADR-0001](docs/adr/0001-apm-is-the-engine-maestro-is-the-cockpit.md).

## Two repositories

- **`maestro`** (this repo) — the product: docs now, cockpit code later. Generic; it can conduct any inventory.
- **`agent-harness`** — the central inventory it conducts: skills, hooks, MCP servers, and bundles, distributable via APM.

## Documentation

Start here, in order:

1. [`CONTEXT.md`](CONTEXT.md) — glossary
2. [`docs/brief.md`](docs/brief.md) — why Maestro exists, the problem, what it is
3. [`docs/jobs/job-map.md`](docs/jobs/job-map.md) — the job hierarchy and MVP1 coverage
4. [`docs/operating-model.md`](docs/operating-model.md) — how product development is run
5. [`docs/adr/`](docs/adr/) — binding decisions

The MVP roadmap (`docs/roadmap/`) is developed next.

> **Status:** concept locked, MVP1 = solo "see + steer" cockpit. Roadmap pending.
