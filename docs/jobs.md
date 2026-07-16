# Jobs — Maestro

The board: the single steering document. What is being built now, what comes
next, what waits, and what is done. Full loop rules live in
`.claude/rules/job-loop.md`; the shape and the why live in
`docs/operating-model.md`.

## The bet

One person can **see** their whole agent setup (the central inventory and what
is deployed where) and **steer** it (deploy, update) from one cockpit, without
per-repo handwork. **Kill question:** do I still open lockfiles or run `apm` by
hand to *know* or *change* what is deployed? If yes, the product is failing.

## Why (the four main jobs)

- **A — Know what I have and where it runs.** See everything centrally and per
  target, so I trust and reuse my setup instead of guessing.
- **B — Get the right capabilities to the right place.** Provision repos and
  tools without handwork, and keep them current.
- **C — Curate team contributions into production-ready central.** *(future,
  team-scale)*
- **D — Turn repeated corrections into reusable capabilities.** *(future, the
  compounding loop)*

## NOW

*(empty — no loop running)*

## NEXT

- Browse picker overhaul · [#145](https://github.com/fimoklei/maestro/issues/145)
  — spec is ready (`ready-for-agent`) and registering repos is today's roughest
  edge in the cockpit.

## LATER

Names only; detail lives in tracker issues, elaboration happens in the grill.

- Compose a bundle (ex-J05)
- Add or edit a primitive in central (ex-J09)
- Deploy hooks and MCP servers (everything shipped is skills-only)
- See local divergence from central (content drift in the deploy-state view)
- See global↔local duplication
- Guard against duplicate deploy
- Backfill a newly-detected global tool
- Update every behind target in one action
- Remove / undeploy a primitive from a target
- Connect & sync the inventory from git

## DONE

All shipped **skills-only**, solo, local-first.

- Register a consuming repo (J10)
- See the central inventory (J01)
- Deploy a skill to a repo (J06)
- See per-repo deploy-state with versions (J02)
- See global deploy-state (J03)
- Deploy a skill globally (J07)
- See drift as a deployed → latest version pair (J04)
- Update a deploy to latest (J08)
- Connect the inventory — point at a local clone (J11)

## Out of scope

Valid jobs, deliberately not being done.

| Job | Reason |
|---|---|
| Reimplement install / sync / pinning / lockfile | APM owns the engine. See ADR-0001. |
| Governance lifecycle (review/approve/required) | Solo has no curation-by-others need yet; future main job C. |
| Compounding loop (corrections → primitives) | Needs adoption and a working manual loop first; future main job D. |
| Adoption dashboards across teams | Needs a team before adoption means anything. |
| Support every AI coding tool | Two tools (Claude Code, Codex) first; breadth later. |
| Auto-generate primitives from PR comments | Needs data integration and a working manual loop first. |
| SaaS backend / RBAC / audit / compliance | Too heavy before solo daily value is proven. |

## Legend (the transition rules)

- A job enters NOW **by name** at grill start; its spec-issue number is written
  on the NOW line the moment `/to-spec` creates it.
- The PR that closes the issue named in NOW moves the job to DONE **in the same
  diff**.
- NOW holds exactly one job. LATER holds names only. A stopped loop moves its
  job back to LATER (or drops it) with one line why.
