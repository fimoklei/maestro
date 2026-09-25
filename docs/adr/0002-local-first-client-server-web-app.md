# ADR-0002 — Maestro is a local-first client-server web-app

- **Status:** Accepted
- **Date:** 2026-05-30

## Context

ADR-0001 settled *what* Maestro is relative to APM (the cockpit above the engine) but left the cockpit's **form** unspecified. The brief calls Maestro a "visual cockpit"; the operating model binds MVP1 to **solo, local-first**; the vision points at a team/org control plane that may one day be **centrally hosted**.

A concrete forcing function surfaced during bootstrap: the owner wants to eventually run Maestro on a personal VPS to exercise the team/enterprise setup — *without building any of that now*. So the form must deliver cockpit value locally today and not foreclose central hosting later.

The candidate forms each carried a real trade-off: a native desktop app (Tauri/Electron) adds packaging/signing/auto-update overhead and, for Tauri, a second language (Rust); a terminal UI is low-friction but cramped for the broad tabular deploy-state and drift views; an all-in-one web meta-framework minimises moving parts but makes the screen↔data boundary optional rather than enforced — and that boundary is exactly what a future move to a VPS depends on.

## Decision

**Maestro is a local-first web application, split client/server, with its domain logic in a framework-free core.**

- **Client (the screen):** a React single-page app (built with Vite). Renders the three views; knows nothing about the local filesystem.
- **Server (the data-half):** a small Hono service. Reads the local `agent-harness` clone, reads APM lockfiles from the local filesystem, and drives the local `apm` CLI. Client and server talk over HTTP.
- **Core (the brains):** a framework-free TypeScript package (inventory model, lockfile reader, APM driver, drift calculation). It depends on neither React nor Hono and is independently testable. *Framework-free* means no React and no Hono — not I/O-free: `core` may use Node built-ins (`node:fs`, `node:child_process`) behind a port, so the pure logic stays unit-testable while the adapters are covered by integration tests.
- **Local-first:** in MVP1 both client and server run on the user's machine (`localhost`). No backend, no cloud.
- **Architected for central, not built for it:** the client↔server HTTP boundary means the server can later move to a VPS without re-architecting. No auth, multi-tenancy, or remote-Git reading is built in MVP1. *Where* the inventory is read from sits behind a single adapter (port); today it reads the local clone, later it can read remote Git.
- **"Where Maestro runs"** (a local process now, a VPS later) is distinct from a deploy **Target** (a consuming repo or a tool config). See `CONTEXT.md`.

**Implementation chosen for this shape** (recorded for traceability; lighter-weight than the shape decision, and individually reversible):

- Node LTS + pnpm monorepo: `packages/core`, `packages/server`, `packages/web`.
- Vitest as the single test runner across all three lanes — pure/unit, web component, and integration. A job whose value is the chain gets one integration test carrying that chain. *Amended [#432](https://github.com/fimoklei/maestro/issues/432): the original fourth lane was BDD acceptance, one Gherkin `.feature` per MVP1 subjob. It is gone — every scenario it held is covered in `tests/integration/`. Vitest as the single runner stands.* *Amended [#780](https://github.com/fimoklei/maestro/issues/780): a fourth lane is back, `tests/git/`, and it draws its boundary on a process call rather than a module kind — a test that spawns a real repository costs seconds, and 16 such files held 97% of the integration lane's wall time, locking the cheap tests behind them. `pnpm test:loop` runs the three cheap lanes; `pnpm test` runs all four. Vitest as the single runner still stands.*
- Biome for lint + format.
- GitHub Actions CI on pull requests, reporting only. CD is deferred. *Corrected [#964](https://github.com/fimoklei/maestro/issues/964): branch protection was never enabled and cannot be — a private repository on the Free plan answers `403 Upgrade to GitHub Pro` on both the protection and rulesets endpoints. The `workflow-commit` gate and `workflow-ship` are what enforce. Amended [#963](https://github.com/fimoklei/maestro/pull/963): CI skips docs-only pull requests and the Windows bootstrap job runs on its own inputs plus weekly, to stay inside the plan's Actions minutes. Amended [#1172](https://github.com/fimoklei/maestro/issues/1172): with the repository public, CI runs on every pull request with read-only permissions, and its `verify` job is the required check.*

## Consequences

- The HTTP contract exists and is exercised from day one, so the eventual VPS move is a **deployment change, not a rewrite**.
- Development runs two processes (behind one command) and carries a maintained API surface — accepted cost for the enforced boundary.
- The framework-free core is reusable by other clients later (e.g. a CLI) because the logic is not trapped in a web framework.
- Central-hosting features (auth, multi-tenancy, remote-Git reading) stay **unbuilt**; when a future roadmap calls for them, they slot behind the existing adapter and API rather than forcing a re-architecture.
- Browser end-to-end tests (Playwright) and CD are deliberately deferred until the UI and a deploy target earn them.
- The individual tool picks (React, Hono, Biome, Vitest, pnpm) can be swapped without revisiting this ADR; the **client-server shape and the local-first / architected-for-central stance** are the binding parts.

## Rejected alternatives

- **Native desktop app (Tauri or Electron).** Tauri adds Rust as a second language for an agent-built, non-engineer-owned project; Electron is heavy and, by 2026, the dated choice. Both add packaging, code-signing, and auto-update work the MVP1 bet does not need. The cockpit value does not require a native shell yet.
- **Terminal UI (Ink).** Lowest friction and lives where APM and the assistants already are, but cramped for the broad tabular deploy-state/drift views and weaker as a "cockpit."
- **All-in-one web meta-framework (Next.js / React Router 7 framework mode).** Fewer moving parts, but the screen↔data boundary becomes optional discipline rather than an enforced wall — risky for agent-built code the owner cannot deeply audit, and it is precisely the boundary the central-hosting future depends on.
- **Reading the inventory directly from remote Git now.** Steps on APM's retrieval role (ADR-0001) and pulls network and auth into MVP1 for no solo benefit. Deferred behind the inventory-source adapter.
- **Building the central/team layer now (auth, multi-tenancy, hosted backend).** That is the future Job C/D scope; building it in MVP1 violates the solo, local-first operating model and overbuilds before solo value is proven.
