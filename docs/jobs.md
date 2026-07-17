# Jobs — Maestro

The board: the single steering document. What is being built now, what comes
next, what waits, and what is done. The transition rules live in the Legend
below; the shape and the why live in `docs/operating-model.md`. The `jobs`
skill steers this board.

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

| Job | Main | Job story |
|---|---|---|
| Register a repo without friction · [#145](https://github.com/fimoklei/maestro/issues/145) | A, B | *When* I add a consuming repo to the cockpit, *I want to* find and pick its path without friction, *so I can* register it in seconds instead of fighting the input. |

## NEXT

*(none picked — choose the next job from LATER)*

## LATER

Detail lives in tracker issues; elaboration happens in the grill.

| Job | Main | Job story |
|---|---|---|
| Compose a bundle (J05) | B | *When* I have recurring sets of primitives, *I want to* compose them into a bundle from the central inventory, *so I can* deploy them together. |
| Add or edit a primitive in central (J09) | B | *When* I create or improve a primitive, *I want to* have it enter the central inventory, *so I can* make it reusable and deployable to any target. |
| Deploy hooks and MCP servers | B, A | *When* my setup needs more than skills, *I want to* deploy hook and MCP server primitives too, *so I can* provision every primitive type, not just skills. |
| See local divergence from central | A | *When* I have edited a deployed primitive in a consuming repo, *I want to* see that it has content-drifted from central, *so I can* tell which copies are modified before I reset or update them. |
| See global↔local duplication | A | *When* a skill is deployed both globally and in a consuming repo, *I want to* have the cockpit flag that overlap in both views, *so I can* remove the redundant copy instead of running two unaware. |
| Guard against duplicate deploy | B | *When* I deploy a skill already deployed on the other scope, *I want to* have the cockpit warn me before it proceeds, *so I can* avoid an accidental duplicate while still keeping a deliberate one. |
| Backfill a newly-detected global tool | B, A | *When* I install a second tool after already deploying globally, *I want to* have the cockpit offer to bring the new tool up to the same set, *so I can* keep my tools in sync instead of the new one starting empty. |
| Update every behind target in one action | B, A | *When* several targets lag the central inventory, *I want to* bring them all current in one action, *so I can* stay up to date without going target by target. |
| Remove / undeploy a primitive from a target | B | *When* a deployed primitive is no longer needed, *I want to* remove it from its target, *so I can* keep that target clean. |
| Connect & sync the inventory from git | A | *When* my central inventory lives in a remote repo I have not cloned, *I want to* point Maestro at its git URL as the inventory source, *so I can* set up the cockpit without cloning by hand first. |

## DONE

All shipped **skills-only**, solo, local-first.

| Job | Main | Job story |
|---|---|---|
| Register a consuming repo (J10) | A, B | *When* I want Maestro to see and steer a project, *I want to* make that consuming repo known to the cockpit, *so I can* see its deploy-state and deploy to it. |
| See the central inventory (J01) | A | *When* I start or plan work, *I want to* see every primitive available in the central inventory, *so I can* reuse what exists instead of guessing. |
| Deploy a skill to a repo (J06) | B, A | *When* I start or extend a project, *I want to* deploy a skill into that consuming repo, *so I can* give the assistant the right context there. |
| See per-repo deploy-state with versions (J02) | A | *When* I work across several consuming repos, *I want to* see which primitives are deployed in each and at which version, *so I can* stop guessing what each project runs. |
| See global deploy-state (J03) | A | *When* I rely on tool-level setup, *I want to* see what is deployed globally for each detected tool, *so I can* understand my baseline across all my work. |
| Deploy a skill globally (J07) | B, A | *When* something should apply everywhere, *I want to* deploy a skill to my global targets, *so I can* have it available across all my work. |
| See drift as a deployed → latest version pair (J04) | A, B | *When* the central inventory moves ahead, *I want to* see which deploys have drifted, shown as deployed → latest, *so I can* tell what needs updating. |
| Update a deploy to latest (J08) | B, A | *When* central changes, *I want to* bring a target up to the latest version from the cockpit, *so I can* avoid bumping pins by hand. |
| Connect the inventory — point at a local clone (J11) | A | *When* Maestro does not yet know where my central inventory is, *I want to* point it at my local clone as the inventory source, *so I can* have the cockpit read and show it instead of dead-ending. |

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

- **Tracker:** GitHub Issues for `fimoklei/maestro`, via `gh`. Spec issues and
  sub-issues live there; the board carries only lane moves.
- A job enters **NOW** by name at grill start (from NEXT, LATER, or brand new);
  its spec-issue number is written on the NOW line the moment `/to-spec` creates
  it.
- The PR that closes the issue named in NOW moves the job to **DONE** in the
  same diff.
- **NOW** holds exactly one job — an empty NOW means no loop is running.
  **NEXT** holds one job with one line why now. A stopped loop moves its job back
  to LATER (or drops it) with one line why.
- Every lane row carries three cells: the job's **handle** (with its J-number or
  tracker ref), its **main-job** letter (A–D, keyed in *Why* above), and a **job
  story** — *When [situation], I want to [motivation], so I can [outcome]*.
