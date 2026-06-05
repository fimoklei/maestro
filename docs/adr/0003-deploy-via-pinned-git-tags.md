# ADR-0003 — Deploy via pinned git tags, not local paths

- **Status:** Accepted
- **Date:** 2026-06-02

## Context

Roadmap 01 promises versions (`J02`), drift (`J04`), and update (`J08`). None of
these are free: whether they exist at all depends on *how* Maestro tells `apm` to
reference a primitive from the central inventory. Before designing the tracer
(sub-step `01.1`), this was observed directly against `apm` 0.16.0 — not guessed
(the `apm-driver.md` discipline in `AGENTS.md`). Three reference modes produce
three different lockfiles and three different drift outcomes:

- **Local path** (`apm install /path/to/agent-harness/skills/tdd`). The lockfile
  records `source: local`, `local_path: …`, and **no version, no commit, no
  content hash**. `apm outdated` reports *"No remote dependencies to check"* —
  the deploy is invisible to drift. This silently kills Ship B.
- **Git ref, unpinned** (`…/skills/tdd`, tracking `main`). The lockfile records a
  raw `resolved_commit` but no human-readable version. Drift tracks the moving
  branch, and `apm` itself warns: *"unpinned — add #tag or #sha to prevent
  drift."*
- **Git ref, pinned to a tag** (`…/skills/tdd#v0.5.0`). The lockfile records
  `resolved_ref: v0.5.0` **and** `resolved_commit`. `apm outdated` prints a table
  with Current / Latest / Status against *git tags* (observed: `v0.5.0` →
  `v0.5.1`, Status `outdated`). Update moves to the latest tag.

The central inventory (`agent-harness`) already publishes semver tags
(`v0.1.0`…`v0.5.1`), so the tagging discipline this requires already exists.

A second observation matters: the "see central" view reads the **local**
`agent-harness` clone, but a git-tag deploy pulls from the **GitHub remote**.
These are deliberately different sources.

## Decision

**Maestro deploys every primitive as a git ref pinned to a published tag,
resolved from the central inventory's Git remote.**

- The deploy-state version shown to the user is the tag (`v0.5.0`), not a commit
  hash.
- **Drift is delegated to `apm outdated`** (per ADR-0001); Maestro never computes
  it. Update is `apm update` to the latest tag.
- The "see central" inventory view reads the **local** `agent-harness` clone;
  **deploy** pulls the tagged ref from the **remote**. Maestro must surface any
  gap between the two, never hide it.

**MVP1 application** (scope-level, reversible — not the binding part): the tracer
deploys the **latest published tag** with no version picker. Resolving "latest
tag" may cost one extra `apm` call (e.g. `apm view`); the exact mechanism is
observed during the `01.1` build, not assumed here.

## Consequences

- Versions in deploy-state are human-readable tags, keeping the setup
  **inspectable** (brief principle 5) — a hash would not.
- Deploy now **requires network** and that the inventory is pushed and tagged on
  GitHub. Offline deploy is given up; accepted, because versions and drift are
  worth more to this product than offline install.
- "See" (local clone) and "deploy" (remote tag) can diverge when the local clone
  is ahead of `origin` or carries untagged work. Maestro surfaces this as a
  first-class state rather than pretending the local edit is deployed.
- The drift signal is *"a newer tag exists"* — the mental model the brief asks
  for, and cleaner than *"main moved."*
- `apm outdated` emits a **human table, no `--json`**. The parser lives behind
  the APM-driver port and is integration-tested against captured real output
  (now obtained from this spike).
- The central inventory must keep a tagging discipline: an untagged or unpushed
  change is **not deployable**. Maestro depends on this process constraint.

## Rejected alternatives

- **Local-path deploy.** Instant and offline, but the lockfile carries no version
  and `apm` ignores it for drift — it kills `J02` version, `J04`, and `J08`. The
  apparent simplicity is a trap.
- **Git ref, unpinned (track `main`).** Drift fires on every commit, the version
  is an opaque sha, and `apm` itself recommends against it — a worse product than
  tags for no real gain.
- **Maestro computes drift itself.** Violates ADR-0001 and would re-derive `apm`'s
  version resolution, going wrong the moment a dependency is pinned.
