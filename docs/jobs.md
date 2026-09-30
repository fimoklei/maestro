# Jobs — Maestro

The need behind every capability: the bet, the themes jobs fall under, and
what is deliberately out of scope. The jobs themselves live as GitHub issues
labelled `job`; the Legend below holds the rules, and
`docs/operating-model.md` the shape and the why. The `jobs` skill steers them.

## The bet

One person can **see** their whole agent setup (the central inventory and what
is deployed where) and **steer** it (deploy, update) from one cockpit, without
per-repo handwork. **Kill question:** do I still open lockfiles or run `apm` by
hand to *know* or *change* what is deployed? If yes, the product is failing.

## Themes

Every job carries one or two theme labels.

- **`theme:setup`** — get Maestro and the Harness running and connected.
  Covers installing Maestro, connecting or disconnecting an inventory source,
  and first open. Once the cockpit reads the Harness, the rest belongs to
  another theme. *E.g.* Connect a registry as inventory source; Disconnect an
  inventory source knowing its impact. [Open jobs](https://github.com/fimoklei/maestro/issues?q=is%3Aissue+is%3Aopen+label%3Ajob+label%3Atheme%3Asetup)
- **`theme:deploy`** — land primitives on a target. Covers deploy, remove and
  the guards around them. Only reading what is deployed is `theme:deploy-state`;
  moving to a newer release is `theme:update`. *E.g.* Deploy hooks and MCP
  servers; Guard against duplicate deploy. [Open jobs](https://github.com/fimoklei/maestro/issues?q=is%3Aissue+is%3Aopen+label%3Ajob+label%3Atheme%3Adeploy)
- **`theme:deploy-state`** — see what runs where and what diverges. Covers
  deploy-state, drift and duplication, read-only. Acting on what it shows
  belongs to another theme. *E.g.* See global↔local duplication; View a skill
  in its local folder. [Open jobs](https://github.com/fimoklei/maestro/issues?q=is%3Aissue+is%3Aopen+label%3Ajob+label%3Atheme%3Adeploy-state)
- **`theme:update`** — keep targets current with Harness releases. Covers
  adopting, rolling back and following renames across releases. Publishing a
  release is `theme:contribute`. *E.g.* Roll back a target to an earlier
  release; Update every behind target in one action. [Open jobs](https://github.com/fimoklei/maestro/issues?q=is%3Aissue+is%3Aopen+label%3Ajob+label%3Atheme%3Aupdate)
- **`theme:contribute`** — get a change of mine into the Harness. Covers
  import, propose, review, release and curating primitives or bundles. Taking
  a released change onto a target is `theme:update`. *E.g.* Add or edit a
  primitive in central; Delete a released skill from the Harness.
  [Open jobs](https://github.com/fimoklei/maestro/issues?q=is%3Aissue+is%3Aopen+label%3Ajob+label%3Atheme%3Acontribute)

## Out of scope

Valid jobs, deliberately not being done.

| Job | Reason |
|---|---|
| Reimplement install / sync / pinning / lockfile | APM owns the engine. See ADR-0001. |
| Governance lifecycle (review/approve/required) | Maestro drives git to the push and gates nothing ([#365](https://github.com/fimoklei/maestro/issues/365)); review and approval happen on GitHub. Roles, approval rules and required-vs-optional wait for team-scale use. |
| Compounding loop (corrections → primitives) | Needs adoption and a working manual loop first. |
| Adoption dashboards across teams | Measuring use means gathering from other people's machines; Maestro is local-only and collects nothing. |
| Support every AI coding tool | Two tools (Claude Code, Codex) first; breadth later. |
| Auto-generate primitives from PR comments | Needs data integration and a working manual loop first. |
| SaaS backend / RBAC / audit / compliance | Too heavy before solo daily value is proven. |

## Legend (the rules)

- **Tracker:** GitHub Issues for `fimoklei/maestro`, via `gh`.
- **A job** is an issue labelled `job` and one or two `theme:*` labels. Title:
  a short verb phrase from the user's side. Body: a **job story** — *When
  [situation], I want to [motivation], so I can [outcome].*
- **Lanes:** LATER is an open job with no lane label. `job:next` marks the job
  picked to go next; it may stay empty. `job:now` marks exactly one job, the
  one in the loop. DONE is a closed job.
- A job gets `job:now` at grill start. A stopped grill removes the label and
  comments one line why.
- Each spec for a new capability is a **sub-issue** of its job. A job may hold
  several specs; one grill designs one spec.
- When every spec under a job is closed, the `jobs` skill asks the operator
  whether the need is met, and closes the job only on yes, with one comment.
