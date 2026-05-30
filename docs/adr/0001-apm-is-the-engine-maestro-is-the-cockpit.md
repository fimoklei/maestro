# ADR-0001 — APM is the engine; Maestro is the cockpit

- **Status:** Accepted
- **Date:** 2026-05-29

## Context

Maestro began as a from-scratch tool that installed and synced skills into repos. It grew a CLI (`packages/cli`) and a set of decisions about a local manifest, repo config, an installed-vs-source seam, retrieval and cache, pin strategy, and drift-reconciling sync.

On first real contact with [APM](https://microsoft.github.io/apm/) — the Agent Package Manager ("npm for agent context") — it became clear that this was a duplication. APM already provides, as a maintained engine:

- retrieval from any Git repo with version pinning;
- `install` and `update` (sync);
- a lockfile for byte-for-byte reproducibility;
- multi-tool targeting (Claude Code, Codex, Cursor, and more);
- install-time policy (`apm-policy.yml`).

Continuing to build that layer means competing with a better-resourced engine and carrying its maintenance forever. But APM has a real gap: it is CLI/YAML only, with **no visibility or control surface**. After adoption you cannot answer "what do I have centrally?" or "what is deployed where, at which version?" — the state is scattered across per-repo lockfiles and tool configs.

## Decision

**APM is the engine. Maestro is the cockpit layer above it.**

- Maestro **does not reimplement** retrieval, install, sync, pinning, the lockfile, or multi-tool targeting. Those are APM's.
- Maestro **reads** APM's lockfiles to build the deploy-state view, and **drives** APM to deploy and update.
- Maestro's product value is **see + steer + curate**: a central inventory view, a deploy-state view (per-repo and global, with versions and drift), bundle composition, and deploy/update — local or global, across Claude Code and Codex.
- **Git stays the source of truth.** The central inventory is the `agent-harness` repo; deploy-state is read from Git and lockfiles. No custom system of record.

This supersedes the prior engine-building direction in the archived `maestro` repo: the manifest/config/installed-seam/cache/pinning/sync decisions are obsolete because APM owns that seam.

## Consequences

- The duplicated engine (`packages/cli` and the engine ADRs: source-vs-installed seam, retrieval-and-cache, manifest pinning, sync-reconciles-drift) is dropped, not ported.
- Maestro depends on APM's behavior; APM changes can affect the cockpit. Accepted: the leverage outweighs the coupling.
- Concepts like `.maestro/manifest.json` and `maestro sync` leave the glossary; `apm.lock.yaml` and `apm install/update` take their place under the hood.
- Two-repo topology: `maestro` (product) is separate from `agent-harness` (the inventory it conducts). One Maestro can conduct any inventory.
- "Global deploy" may not be native to APM; if so, Maestro adds it on top. To verify in the roadmap grill. It remains in scope conceptually regardless.

## Rejected alternatives

- **Keep building the own engine.** Rejected: duplicates APM, perpetual maintenance, no differentiation. This is the mistake this ADR corrects.
- **Fork or wrap APM as a hard dependency in our binary.** Rejected for MVP1: heavier coupling than needed; drive APM as a tool first and revisit only if a real limit appears.
- **Build a heavy product (dashboards, approval UI, SaaS) on top of APM now.** Rejected: that is the org-scale vision, not the solo MVP1 bet; it risks overbuilding before adoption is proven.
