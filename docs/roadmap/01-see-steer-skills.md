# Roadmap 01 — See + steer, skills only

Release contract for the first committed step. Selects subjobs from
`docs/jobs/job-map.md`; does not redefine them. When this file and the job map
disagree on scope, this file wins for this step (decision hierarchy in
`operating-model.md`).

## What this step proves

The MVP1 bet — *see + steer, solo* — narrowed to **skills**. One person can see
their central skills and what is deployed where (local repos and global), and
deploy or update from the cockpit, without per-repo handwork and without opening
a lockfile. It proves the bet end-to-end through every layer
(`web → server → core → apm`). It deliberately defers bundle composition and
authoring.

This is not a feature list. It succeeds or dies on the kill condition in *Exit
criteria*.

## Selected subjobs

`J01`, `J02`, `J03`, `J04`, `J06`, `J07`, `J08`. Definitions live in the job map.

## Out of scope (this step)

- **`J05` compose a bundle** — a separate UI surface (select → assemble → name).
  The deploy mechanics are identical (a bundle is an `apm.yml` with deps), so
  deferring loses nothing on the driver side. Next step.
- **`J09` add/edit a primitive in central** — authoring is a separate concern.
- **Hooks and MCP servers** — skills only. A hook runs code at a lifecycle point
  (more risk, more validation); an MCP server touches tool config. Skills are
  files only — the cleanest tracer.
- **Rich drift** — drift is shown **binary** (up-to-date / behind), not as
  version diffs.
- **Directory scan for consuming repos** — explicit registry only (see
  `CONTEXT.md`).

## Unit and targets

- **Unit:** a single skill (not a bundle).
- **Targets:** one local consuming repo (from the registry) **and** global
  (`~/.apm/`, which is APM-native — verified, see ADR-0001 consequence).

## Build order — two ships, one step

- **Ship A — the tracer.** See central skills → deploy one skill to one
  registered local repo → see it in deploy-state. All layers. No global, no
  drift, no update. One acceptance test covers the journey.
- **Ship B — fast-follow, same step.** Add the global target, add drift
  (binary), add update.

Rationale: the tracer proves the architecture and surfaces **real `apm` output**
before drift is built on top of it. Drift on an understood foundation, not on an
assumption.

## Sub-steps and tracking

Each sub-step is a vertical slice that runs the execution pipeline: **grill → PRD
(the spec, a tracker issue) → issues → TDD**. `01.1` is Ship A; `01.2`–`01.4` are
Ship B.

| Sub-step | Delivers (subjobs) | Spec (PRD) | Status |
|---|---|---|---|
| 01.1 — Tracer: see skills + deploy to a local repo + see-back | J01, J06, J02 | — | Planned |
| 01.2 — Global as a target | J03, J07 | — | Planned |
| 01.3 — Drift (binary) | J04 | — | Planned |
| 01.4 — Update | J08 | — | Planned |

Status: **Planned → Specced (PRD #) → Building (sub-issues) → Done.**

This table is a **map, not a dashboard.** The stable columns (sub-step, subjobs,
PRD link) live here. Live progress — which issues are open or closed — lives in
the issue tracker, never re-typed here. Hand-maintaining status in markdown is
the per-repo handwork Maestro exists to kill.

## How drift and update work (APM-delegated)

- **Drift judgment is delegated to `apm outdated`** (per repo, plus `-g` for
  global), never computed in Maestro — honoring ADR-0001 ("never reimplement
  APM"). Computing it ourselves would re-derive APM's version-resolution and go
  wrong the moment a dep is pinned.
- `apm outdated` has **no `--json`** — output is a human table. The parser is
  isolated behind the APM-driver port and covered by an integration test against
  **captured real output**. That output must be **observed from a real install**
  (no lockfile exists anywhere yet) before the parser is written — this is the
  `apm-driver.md` trigger in `AGENTS.md`. The tracer ship forces that real
  install early.
- **Update is APM's `update`** — the same driver port as deploy (`install`).

## How "see" reads (per ADR-0002)

- **Central inventory:** the server reads the local `agent-harness` clone and
  lists `skills/<name>/SKILL.md` (name + description from frontmatter).
- **Deploy-state:** reads `apm.lock.yaml` in each registered repo and
  `~/.apm/apm.lock.yaml` for global.

## Registry

A Maestro-owned list of consuming-repo paths, **added explicitly by the user**.
No scan. Defined as **Consuming-repo registry** in `CONTEXT.md`.

## Exit criteria

**The whole step is done when:**

- I open the cockpit and see every central skill, without opening an
  `agent-harness` file.
- I see, per registered repo and for global, which skills are deployed and at
  which version, without opening a lockfile.
- I deploy a skill to a repo and to global from the cockpit, and deploy-state
  reflects it.
- The cockpit shows behind / up-to-date per skill, and I update to latest with
  one action.
- **Kill condition:** if I still open a lockfile or run an `apm` command by hand
  to *know* or *change* what is deployed, the step has failed.

**Ship A (the tracer) is done when:**

- I see central skills, deploy one to one registered local repo, and see it in
  deploy-state — end to end, screen to `apm`.
- One acceptance test covers that journey against the server API (a `J01`/`J06`
  scenario).

## Risks

- **`apm outdated` has no machine output.** Table parsing is brittle and breaks
  if APM reformats. Mitigation: isolate behind the driver port, integration-test
  against captured output, consume binary-only.
- **APM behavior assumed where unobserved** (no lockfile exists yet). Mitigation:
  the tracer ship forces a real deploy early; write `apm-driver.md` from observed
  output, not guesses.
- **Scope creep back toward bundles / authoring / hooks.** Mitigation: the
  out-of-scope list above is binding for this step.
