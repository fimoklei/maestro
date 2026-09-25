# ADR-0005 — Drift is a separate read from deploy-state, not part of its payload

- **Status:** Accepted
- **Date:** 2026-06-14

## Context

Sub-step `01.3` surfaces **version drift** binary — behind /
up-to-date per deployed skill, per registered repo and for global. The cockpit
already shows deploy-state ("what is deployed where, at which version") from a
fast, local read of each `apm.lock.yaml`. Drift is the natural neighbour on the
same screen, so the obvious move is to enrich the deploy-state payload with a
per-skill `behind | up-to-date` flag and serve it from one endpoint.

That move ignores a hard asymmetry between the two reads:

- **Deploy-state** reads a local file (`apm.lock.yaml`) through the filesystem
  port. Milliseconds. No network, no auth.
- **Drift** is delegated to `apm outdated` (ADR-0001), which resolves the latest
  tag from the **GitHub remote**. Seconds; needs network and auth; can fail
  (offline, no token, `apm` missing) — see `apm-driver.md`.

The two reads also fail independently: deploy-state succeeding tells you nothing
about whether drift could be checked, and a drift failure must not erase the
skill list, which never needed the network.

## Decision

**Drift is served by its own read, separate from deploy-state.**

- Dedicated endpoints: `GET /api/drift?repo=…` and `GET /api/drift/global`,
  backed by a core use-case `CheckVersionDrift` (registry-gated before any `apm`
  access, mirroring `DeploySkill`).
- The drift read returns a per-target outcome: `{ ok: true, behind: string[] }`
  (the skill names that lag; empty = all up-to-date) or `{ ok: false }` (the
  check could not run). It returns **only** the "behind" set — identity of which
  skills exist stays with deploy-state's lockfile read, never the `apm outdated`
  table (whose Package column truncates; see `apm-driver.md`).
  - **Payload superseded by ADR-0007:** each behind entry is now a
    `{ name, current, latest }` pair, not a bare name. The separate-read and
    `{ ok: false }` "unknown" decisions in this ADR are unchanged.
- The web layer runs two queries on one screen: deploy-state renders the skill
  list immediately, and the drift query fills in a per-skill badge
  (behind / up-to-date / unknown) when it returns. "unknown" is a per-target
  state — one `apm outdated` call per target succeeds or fails as a whole.

## Consequences

- The skill list never waits on the network. The cockpit stays responsive even
  when drift is slow or fails — the screen the user came for is local and fast.
- Fault isolation: a drift failure degrades to "unknown" badges, not a broken
  deploy-state view. This preserves the project's standing rule that an empty or
  missing result must never silently stand for a successful "all up-to-date"
  (see `deploy-state-reader.ts`).
- Two endpoints and two query hooks instead of one — slightly more surface. This
  is the cost paid for the responsiveness and fault isolation above, and it fits
  the `frontend.md` convention (one custom hook per server resource).
- After a mutation that can change drift (deploy now, update in `01.4`), the
  drift query for that target is invalidated and refetched, per `frontend.md`.

## Rejected alternatives

- **Extend the deploy-state payload with a per-skill drift flag (one endpoint).**
  Simpler client code, but it chains a fast local read to a slow networked one:
  the skill list would block on `apm outdated`, and a drift failure would fail
  the whole screen. Wrong trade for a cockpit whose value is a frictionless,
  always-available view (roadmap `01.5`).
- **A drift endpoint that returns its own skill list (identity from the table).**
  Would duplicate deploy-state's job and force matching on the truncatable
  Package column. Identity belongs to the lockfile; the table yields only
  presence + status.
