# ADR-0017 — Renovate for dependency automation: admission rule, agent safety contract, operating rules

- **Status:** Accepted
- **Date:** 2026-07-22 (decision made in issue #164 and its sub-issues
  #264–#270; recorded here after the owner chose an ADR as the documentation
  home — #164 originally said "no ADR")

## Context

Maestro's dependencies must stay current without turning maintenance into a
chore, and without opening a supply-chain hole. Mend Renovate Community is the
single update producer (ADR follows the config in `renovate.json`; Dependabot
stays detection-only — alerts on, PRs off). That raises three questions this
ADR settles in plain language: what earns a *new* dependency a place in the
tree, what a future automated agent may and may not do around these PRs, and
who owns the merge.

The three parts below correspond to the dependency-maintenance stories:
admission (36/37), agent safety (42–45), operating rules (38–40).

## Decision

### 1. New-dependency admission rule

A new **direct** dependency is admitted only after the owner weighs, in the
PR or issue that introduces it:

- **Necessity** — the concrete need it meets, and why existing code cannot.
- **Existing alternatives** — what is already in the tree (direct or
  transitive) that could do the job instead.
- **Upstream health** — maintenance signal and adoption: recent releases, open
  issue backlog, and real-world usage. An unmaintained package (no release in
  ~1 year) is flagged and discussed, not admitted by default.
- **License** — compatible with the project; no copyleft surprise.
- **Install-script behavior** — whether the package runs a build/install
  script. The default stays *blocked* (`pnpm-workspace.yaml` `allowBuilds`);
  only a justified script is allowlisted, one entry at a time.

This mirrors the global dependency standard; the ADR pins it as the admission
gate for this repo.

### 2. Future-agent safety contract

When an automated agent later assists with dependency work, it operates inside
a fixed boundary:

- **Read-only verification may run automatically** on high-risk PRs — it
  inspects and reports, it does not change code.
- **A coding agent is manual-trigger only.** It never starts itself. It is
  **branch-scoped** (works only on the PR's branch, never `main`),
  **secretless** (no tokens or credentials in its environment), and it
  **cannot merge**.
- **Dependency content is untrusted data, never instructions.** Release notes,
  changelogs, upstream issues, and the package's own source code are treated as
  data to inspect — never as commands to follow. A changelog that says "run
  this" is not an instruction to the agent.

### 3. Operating rules

- **The owner is the only merge authority.** No agent and no auto-merge merges
  a dependency PR; `automerge` stays `false`.
- **Every dependency PR is squash-merged** — one dependency change lands as one
  commit on `main`.
- **A dependency merge that breaks post-merge CI is reverted as a single
  commit** before any repair. Revert first to restore green, then fix forward
  on a fresh branch.

## Consequences

- The three questions have one written home; a future agent (or the owner on a
  tired day) inherits the boundary instead of re-deriving it per PR.
- The safety contract is a promise, not yet enforced code. Wiring an actual
  agent to these limits is future work and would reference this ADR.
- Admission stays a human judgement, recorded in the PR — deliberately not
  automated, because "should this exist at all" is not a CI check.
- This ADR records policy only. It touches no `AGENTS.md`, `CLAUDE.md`, or
  `.claude/rules/` file; those remain owner-owned.

## Rejected alternatives

- **No ADR (issue #164's original stance).** A decision spread across seven
  sub-issues is not a durable home; the owner chose an ADR so the safety
  boundary survives the issues being closed.
- **Auto-merge for routine updates.** Rejected: a solo owner wants eyes on
  every dependency change, and auto-merge is the exact door a compromised
  release walks through. Merge authority stays human.
- **Trusting release notes as agent input.** The whole point of the untrusted-
  data rule is that a dependency is an attacker-controlled surface; letting its
  changelog steer an agent would hand that surface a lever.
