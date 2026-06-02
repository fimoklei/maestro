# Operating Model — Maestro

## Purpose

Keep product development job-driven, not feature-driven:

```text
Product brief → Job map → MVP roadmap (sub-steps) → PRD spec (tracker) → issues → TDD
```

Designed for use with an LLM or coding agent: enough product context to act, not enough rope to invent features outside the active MVP.

---

## Core principle

**Jobs are the product spine. Features are children of jobs.** A feature is built only when it supports a named subjob in the active MVP — never because it sounds useful.

And one binding constraint above all: **APM is the engine; Maestro is the cockpit** (ADR-0001). Never reimplement install, sync, pinning, the lockfile, or multi-tool targeting.

---

## Two repositories

Maestro is two repos with distinct roles. Do not mix them.

```text
maestro/                     # THE PRODUCT — generic; can conduct any inventory
  CONTEXT.md                 # canonical glossary
  README.md
  docs/
    brief.md
    operating-model.md
    jobs/job-map.md
    adr/NNNN-<slug>.md       # binding decisions (4-digit)
    roadmap/NN-<slug>.md     # one per committed MVP
  (product code added later)

agent-harness/               # THE CENTRAL INVENTORY — the content Maestro conducts
  skills/<name>/SKILL.md     # flat, APM-clean
  hooks/<name>/
  bundles/<name>/apm.yml
  apm.yml
  (no product-strategy docs)
```

Product-strategy docs live in `maestro`. The `agent-harness` repo stays a clean, APM-distributable inventory; it carries only its own operational docs (contribution flow, README).

Core spine docs (load these for any product question): `CONTEXT.md`, `docs/brief.md`, `docs/jobs/job-map.md`, the active `docs/roadmap/NN-*.md`, `docs/operating-model.md`, every accepted ADR.

### File naming

- **Roadmap** `NN-slug.md`: zero-padded two-digit sequence; slug describes the bet, not the MVP number (`01-cockpit-see-steer.md`, not `mvp-1.md`). Created only when scope is committed.
- **ADR** `NNNN-slug.md`: four-digit zero-padded sequence, assigned in order, never re-used or renumbered. Cross-reference as `ADR-NNNN`.

---

## Document responsibilities

### `brief.md`
Strategic context: why exist, problem, audience, what Maestro is, relationship to APM, MVP1 bet, vision, principles. Not a backlog, not a job hierarchy.

### `jobs/job-map.md`
Canonical job hierarchy and coverage check. Main jobs, subjobs, and which are active/future/out-of-scope. Main protection against feature drift.

Rules:
1. Jobs describe progress, not features. "See what is deployed where" is a job; "build a deploy-state table component" is not.
2. Features are children of jobs. No feature enters the active MVP without a named subjob.
3. Subjobs ladder up to at least one main job.
4. Subjob IDs assigned on activation; future subjobs listed by name only.
5. Future jobs don't leak into the active MVP.

### `roadmap/NN-<slug>.md`
Release contract for one MVP: what we prove, selected subjobs, in/out of scope, exit criteria, risks. References subjob IDs from the job map; does not redefine them. Lists the MVP's **sub-steps** (vertical slices) with their PRD links; live build status stays in the tracker, not in this file.

Two grill altitudes feed this chain: a **step-grill** sets a roadmap's scope (this file); a **sub-step-grill** designs one sub-step and produces its PRD.

### `CONTEXT.md`
Canonical glossary. One sentence per term, aliases to avoid, ambiguous terms flagged. No implementation. When a doc disagrees with `CONTEXT.md`, `CONTEXT.md` wins. Updated inline as terms resolve, never in batch.

### `docs/adr/NNNN-<slug>.md`
Binding decisions that are hard to reverse, surprising without context, and the product of a real trade-off. Accepted ADRs override `brief.md` and `operating-model.md` on the topic they decide. Each records: context, decision, consequences, rejected alternatives. Do not write ADRs for easy, obvious, or trade-off-free decisions.

### PRD (tracker issue) — the spec
Concrete behavior for a roadmap sub-step (inventory model, deploy mechanism over APM, deploy-state reading, cockpit interactions). Lives as a **PRD issue in the tracker**, produced by a sub-step grill and sliced into implementation issues. There is no `docs/specs/` tree; durable cross-cutting decisions become ADRs, not specs.

---

## Rules for an LLM or coding agent

1. **Do not build beyond the active MVP.** MVP2+ is documented as future, not implemented.
2. **Every feature maps to a job.** Map to a job ID before proposing or building. No mapping → don't build.
3. **Never reimplement APM.** Drive it; read its lockfiles. (ADR-0001)
4. **Keep MVP1 local-first.** Value in the local environment before any backend.
5. **Solo-first.** Do not build governance, team curation, RBAC, dashboards, or the compounding loop in MVP1.
6. **Preserve trust through inspectability.** The user must see what is deployed and where it came from.
7. **Two repos, distinct roles.** Product docs/code in `maestro`; inventory in `agent-harness`. Keep `agent-harness` APM-clean.

---

## Decision hierarchy

When documents conflict, priority:

```text
1. Active roadmap file — active MVP scope
2. jobs/job-map.md — canonical job definitions
3. Accepted ADRs — the specific decision they record
4. CONTEXT.md — terminology
5. brief.md — product strategy and principles
6. operating-model.md — process and file responsibilities
```

Unresolvable conflict → stop and flag, do not guess.

---

## Strategic warning

Weak product: a GUI for APM.
Strong product: the cockpit for your agent setup — see and steer it from one place.
Strongest product: a compounding team control plane where curated capabilities flow everywhere and every correction improves them.

MVP1 proves the cockpit at N=1 before chasing the strongest version.
