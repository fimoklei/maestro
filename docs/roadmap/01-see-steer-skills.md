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

`J01`, `J02`, `J03`, `J04`, `J06`, `J07`, `J08`, `J10`, `J11`. Definitions live
in the job map. (`J11` — connect the inventory, offline — joined at the 01.5
re-scope; see *01.5 scope* below.)

## Out of scope (this step)

- **`J05` compose a bundle** — a separate UI surface (select → assemble → name).
  The deploy mechanics are identical (a bundle is an `apm.yml` with deps), so
  deferring loses nothing on the driver side. Next step.
- **`J09` add/edit a primitive in central** — authoring is a separate concern.
- **Hooks and MCP servers** — skills only. A hook runs code at a lifecycle point
  (more risk, more validation); an MCP server touches tool config. Skills are
  files only — the cleanest tracer.
- **"N versions behind" distance** — drift shows the deployed → latest version
  pair (ADR-0007, read from `apm outdated`), but **not** how many tags lie
  between them, nor progress bars. (The original binary-only scope was widened to
  the version pair at the 01.5 re-scope; the distance stays out.)
- **Directory scan for consuming repos** — explicit registry only (see
  `CONTEXT.md`).
- **Interactive directory-browser picker for registration** — paste-a-path only
  this step; a server-side filesystem-listing endpoint is deferred (security
  surface vs. core value, see *Registry*).

## Unit and targets

- **Unit:** a single skill (not a bundle).
- **Targets:** one local consuming repo (from the registry) **and** global
  (`~/.apm/`, which is APM-native — verified, see ADR-0001 consequence).

## Build order — two ships and a design pass

- **Ship A — the tracer.** See central skills → deploy one skill to one
  registered local repo → see it in deploy-state. All layers. No global, no
  drift, no update. One acceptance test covers the journey.
- **Ship B — fast-follow, same step.** Add the global target, add drift, add
  update.
- **Pass C — the design pass (01.5).** *After every job above lands*, one pass
  realizes the working cockpit in the owner's designed system (ADR-0004 +
  ADR-0008 own the stack and sequencing). Re-scoped 2026-06-19: it carries two
  small capability deltas (version-pair drift, offline connect — see *01.5
  scope*) built capability-first, then makes the whole working product
  frictionless in one styled UI pass. See *Design principle* below.

Rationale: the tracer proves the architecture and surfaces **real `apm` output**
before drift is built on top of it. Drift on an understood foundation, not on an
assumption. The design pass comes last, over a complete and working product, so
it styles real behaviour — never a façade with dead controls.

## Sub-steps and tracking

Each sub-step is a vertical slice that runs the execution pipeline: **grill → PRD
(the spec, a tracker issue) → issues → TDD**. `01.1` is Ship A; `01.2`–`01.4` are
Ship B.

| Sub-step | Delivers (subjobs) | Spec (PRD) |
|---|---|---|
| 01.1 — Tracer: register a repo + see skills + deploy + see-back | J10, J01, J06, J02 | [#8](https://github.com/fimoklei/maestro/issues/8) |
| 01.2 — Global as a target | J03, J07 | [#26](https://github.com/fimoklei/maestro/issues/26) |
| 01.3 — Drift (binary) | J04 | [#44](https://github.com/fimoklei/maestro/issues/44) |
| 01.4 — Update | J08 | [#52](https://github.com/fimoklei/maestro/issues/52) |
| 01.5 — Design pass + two capability deltas (see *01.5 scope* below) | J04 (version-pair), J11 (offline connect) | [#75](https://github.com/fimoklei/maestro/issues/75) |

This table is a **map, not a dashboard.** Only the stable columns (sub-step,
subjobs, PRD link) live here. Status is **derived from the tracker, never
written here**: no PRD link = planned; PRD issue open = specced or building
(sub-issues tell which); PRD issue closed = done. Hand-maintaining status in
markdown is the per-repo handwork Maestro exists to kill — do not add a status
column back.

## Design principle — frictionless experience

`01.5` is governed by a principle as much as by its two subjobs: **using the
cockpit should feel frictionless.** Once every job above works, one design pass
realizes that working product in the owner's designed system so the experience
matches the capability. Beyond its two capability deltas (see *01.5 scope*), the
pass adds no further behaviour — the frictionless bar is the quality the finished
step is held to. The stack and the capability-before-UI
sequencing live in ADR-0004. (If this principle proves cross-cutting beyond this
step, graduate it to `brief.md`; for now it scopes the design pass only.)

## 01.5 scope — design pass + two capability deltas (decided 2026-06-19)

A design grill against the owner's "Control Room" design reconciled it with this
step's committed scope. `01.5` stays the closing **design pass**, but absorbs two
small capability deltas the design justified. The design is **input, not a
spec** — it is not copied 1:1.

**Design system.** Control Room is adopted as the project's design system
(ADR-0008, amending ADR-0004): tokens via Tailwind `@theme`, owned components,
catalogue + theming imported, shadcn only where interaction earns it.

**Two capability deltas (both small, core/server-first):**

- **Version-pair drift** (J04) — show the deployed → latest pair, read from the
  `apm outdated` output already parsed (ADR-0007). No new `apm` call. Drops the
  design's "N versions behind" bars.
- **Offline connect-inventory** (J11) — a UI + config-write endpoint to point
  Maestro at an **existing local** `agent-harness` clone (validate, persist
  `inventoryPath`), turning the existing "not-configured" dead-end into a
  first-run flow. **Stays offline.** Cloning from a git URL is deferred — job map
  Future "Connect & sync the central inventory from git".

**Held to existing scope.** Skills only; no Compose, no hooks/MCP/bundles, no
dead nav. Components stay type-aware (`TypeTag`) so future primitive types slot
in additively without rework.

**App shell.** A light client-side router; sidebar with **Deploy-state as home**
(landing) + Inventory; Targets + register inline; connect as a Settings screen
plus a first-run gate when not configured.

**Build route (binding order, honours ADR-0004).** 1 — the two capability deltas
in core/server, TDD, no styling; 2 — design-system foundation (tokens +
components); 3 — one styled UI pass over the complete working capability. No
styled UI lands before the capability is real; no façade with dead controls.

The PRD for `01.5` is tracker issue #75, sliced into implementation issues
per this scope.

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
- **Update is a re-install at the latest tag**, not `apm update`. Maestro pins
  exact tags (ADR-0003), and `apm update` is a no-op on an exact pin (spiked
  2026-06-16, see `apm-driver.md`). Update = resolve the latest tag, then
  `apm install …#<latest-tag>` — reusing the deploy driver, no new apm command.

## How "see" reads (per ADR-0002)

- **Central inventory:** the server reads the local `agent-harness` clone and
  lists `skills/<name>/SKILL.md` (name + description from frontmatter).
- **Deploy-state:** reads `apm.lock.yaml` in each registered repo and
  `~/.apm/apm.lock.yaml` for global.

## Registry

A Maestro-owned list of consuming-repo paths, **added explicitly by the user**
(`J10`). No scan. Defined as **Consuming-repo registry** in `CONTEXT.md`.

Registration UX for this step is **paste an absolute path → server validates**
(exists, is a directory). An interactive directory-browser picker is deferred: a
browser cannot hand the server a real path, so a picker means a server-side
filesystem-listing endpoint — the most security-sensitive surface in MVP1 — for
the least-core subjob. Revisit if it earns it (see out-of-scope).

## Exit criteria

**The whole step is done when:**

- I open the cockpit and see every central skill, without opening an
  `agent-harness` file.
- I see, per registered repo and for global, which skills are deployed and at
  which version, without opening a lockfile.
- I deploy a skill to a repo and to global from the cockpit, and deploy-state
  reflects it.
- The cockpit shows the deployed → latest version pair per skill, and I update
  to latest with one action.
- The design pass (`01.5`) has realized this working cockpit in the designed
  system, so the experience is frictionless — not a raw prototype.
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
  against captured output, and consume only the two version fields it already
  prints (deployed → latest; no tag-distance — ADR-0007).
- **APM behavior assumed where unobserved** (no lockfile exists yet). Mitigation:
  the tracer ship forces a real deploy early; write `apm-driver.md` from observed
  output, not guesses.
- **Scope creep back toward bundles / authoring / hooks.** Mitigation: the
  out-of-scope list above is binding for this step.
