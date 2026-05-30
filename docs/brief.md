# Brief — Maestro

## One-line concept

**Maestro is a visual cockpit to see and steer your AI agent setup — skills, hooks, and MCP servers — across your repositories and tools, built on top of APM.**

---

## Product thesis

[APM](https://microsoft.github.io/apm/) ("npm for agent context") solved **distribution**: install, sync, version pinning, a lockfile, multi-tool targeting, and install-time policy. That engine is good.

What APM does not give you is **visibility and control**. Once you adopt it, you cannot answer the two questions that matter day to day:

> **What do I have available centrally? And what is deployed where, at which version?**

The state lives scattered across per-repo lockfiles and tool configs. There is no single place to look, and no single place to act. APM is a powerful engine without a cockpit.

Maestro is that cockpit.

> **The strong framing:** the cockpit for your agent setup.
> **The strongest long-term framing:** a control plane where curated, production-ready capabilities flow to every repo and tool, and every repeated correction can improve them.

---

## Problem

The pain is concrete and was felt on a first real run with APM. Four symptoms, one root cause.

### 1. Placement is opaque

You run APM and everything lands locally in each repo. You expected some things to be global. The mental model of *where capabilities live and why* is lost immediately.

### 2. No central overview

You cannot see, in one glance, what you have available centrally to reuse in future projects.

### 3. Authoring and bundling is friction

You write a new skill — now how do you add it? How do you compose a bundle easily from what you already have?

### 4. Cross-repo distribution is blind handwork

A skill changes, and you bump the pin by hand across several repos. You cannot even remember which repo runs which version.

### Root cause

You cannot **see** or **steer** your own agent setup. The engine works; the cockpit is missing.

This is the same problem an organization eventually faces at scale — "what does every assistant in this company know?" — but at N=1. The solo cockpit is the seed of the team control plane.

---

## Who it is for

Maestro is built **solo-first, then team, then organization**. The order is deliberate: the value and the validation are at N=1 today.

- **You (the solo power-user)** — primary user for MVP1. You manage a central inventory and roll it out across your own projects and tools.
- **Your team** — next. When teammates contribute custom primitives, those arrive centrally and must be curated before they become deployable. This is where the governed lifecycle begins to matter.
- **The organization** — the long-term frontier: governance, adoption visibility across teams, security-mandated primitives. Explicitly *not* MVP1.

The enterprise framing (platform teams, security teams, EM dashboards) is the grown-up form of the same product. It is vision, not the MVP1 promise.

---

## What Maestro is

A cockpit over APM, organized along **two axes** and **three views**.

**Two axes**
- **Unit:** a single primitive (skill / hook / MCP server) **or** a bundle.
- **Target:** **local** (a consuming repo) **or** **global** (a tool: Claude Code, Codex).

**Three views**
1. **Inventory** — what you have centrally available to reuse. Source of truth is the `agent-harness` repo. Central means **curated, production-ready**.
2. **Deploy-state** — what is deployed right now and where, with versions: per consuming repo and per global target. Drift is visible here.
3. **Compose + deploy** — assemble a bundle from the inventory, then deploy a primitive or bundle to a repo or globally, and update it later.

**Two scenarios that prove it**
- *New React project* → open the cockpit → deploy the `frontend` bundle locally to that repo.
- *New skill* → add it to the inventory → deploy it globally for Codex and Claude Code.

---

## Relationship to APM

Maestro **does not reimplement** install, sync, pinning, the lockfile, or multi-tool targeting. APM owns the engine. Maestro is the layer above it: see, steer, curate. The cockpit reads APM's lockfiles to build the deploy-state view and drives APM to deploy and update.

This boundary is binding. See **ADR-0001 — APM is the engine; Maestro is the cockpit**.

The two-repo topology reflects this:
- **`maestro`** — the product (this repo): docs now, cockpit code later. Generic: it can conduct any inventory.
- **`agent-harness`** — the central inventory it conducts: skills, hooks, MCP servers, bundles. APM-clean and distributable.

---

## MVP1 product bet

> **Can one person see their entire agent setup — central inventory and what is deployed where — and deploy or update skills, hooks, and bundles to any repo or globally, from one cockpit, without per-repo handwork?**

MVP1 proves *see + steer*, solo. It does not prove governance, team curation, or the compounding loop.

What ships first within that bet (e.g. skills+bundles before hooks/MCP, or read-only before steering) is a roadmap decision, made in the roadmap grill — not here.

---

## Vision (post-MVP)

The MVP1 cockpit grows into a control plane. These are the deliberately-deferred layers:

- **Governed lifecycle** — team members contribute primitives; they enter centrally and must be **curated** (reviewed, approved) before becoming deployable. Review, approval, and adoption visibility are the team/org differentiator.
- **Compounding loop** — repeated corrections (in review, in incidents) become reusable primitives, so the whole setup improves over time. This is the thing APM can never do.
- **Organization scale** — required vs optional primitives, shadow-skill detection, adoption across teams, security-mandated coverage.

The vision stays on the page as direction. It does not leak into MVP1 scope.

---

## Product principles

1. **Lean on APM — never rebuild it.** Every distribution mechanism that exists in APM is used, not reimplemented. (ADR-0001)
2. **Solo-first, then team.** Validate at N=1 before adding governance.
3. **Local-first.** Value lands in your local environment before any backend exists.
4. **Git as source of truth.** The central inventory is a Git repo; deploy-state is read from Git/lockfiles. No custom system of record.
5. **Inspectable, not magical.** You must always be able to see what is deployed and where it came from.
6. **Boring MVP, compounding future.** Start simple; the long-term value is the curation + correction loop.
7. **Tool-agnostic, two tools now.** Designed for many tools; built for Claude Code and Codex from day one.

---

## Product risks

- **Accidentally rebuilding APM.** The exact mistake that triggered this reset. Mitigation: ADR-0001, and the principle above.
- **The cockpit becomes heavy.** Mitigation: read-first, thin steering, no SaaS in MVP1.
- **Scope creep into governance too early.** Mitigation: solo-first; governance is explicitly future.
- **Inventory becomes stale.** Mitigation: the deploy-state and drift views make staleness visible; curation keeps central production-ready.

---

## Strategic warning

- **Weak product:** a GUI for APM.
- **Strong product:** the cockpit for your agent setup — see and steer it from one place.
- **Strongest product:** a compounding team control plane where curated capabilities flow everywhere and every correction improves them.

MVP1 proves the cockpit at N=1 before chasing the strongest version. If *see + steer* works for one person, the team and org roadmap becomes far more valuable. If it does not, governance and dashboards do not matter.
