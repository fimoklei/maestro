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

## NEXT

| Job | Main | Job story |
|---|---|---|

## LATER

Detail lives in tracker issues; elaboration happens in the grill.

| Job | Main | Job story |
|---|---|---|
| Cut a Maestro release a teammate can pull · [#621](https://github.com/fimoklei/maestro/issues/621) | C | *When* I fix or extend the cockpit, *I want to* publish a tagged release of Maestro itself, *so I can* have teammates pull a version that works instead of whatever `main` happens to be. |
| Read the shared skills directory truthfully · [#172](https://github.com/fimoklei/maestro/issues/172) | A, B | *When* my tools read one shared skills directory, *I want to* have the cockpit show one source read by many tools, *so I can* trust deploy-state, drift, and cleanup on my real machine. |
| View a skill in its local folder | A | *When* I inspect a skill in the cockpit, *I want to* open the local folder that holds it, *so I can* read or edit its files without hunting for the path. |
| Connect a registry as inventory source | A | *When* my central inventory is published to an apm registry, *I want to* point Maestro at it as the inventory source, *so I can* run the cockpit without a local clone. |
| Disconnect an inventory source knowing its impact | A | *When* an inventory source is no longer the one I steer from, *I want to* see what disconnecting it does to the primitives already deployed to my targets before I confirm, *so I can* remove it without silently orphaning deploys I still rely on. |
| Compose a bundle (J05) | B | *When* I have recurring sets of primitives, *I want to* compose them into a bundle from the central inventory, *so I can* deploy them together. |
| Add or edit a primitive in central (J09) | B | *When* I create or improve a primitive, *I want to* have it enter the central inventory, *so I can* make it reusable and deployable to any target. |
| Deploy hooks and MCP servers | B, A | *When* my setup needs more than skills, *I want to* deploy hook and MCP server primitives too, *so I can* provision every primitive type, not just skills. |
| See local divergence from central | A | *When* I have edited a deployed primitive in a consuming repo, *I want to* see that it has content-drifted from central, *so I can* tell which copies are modified before I reset or update them. |
| Bring an edited deployed copy back into central · [#716](https://github.com/fimoklei/maestro/issues/716) → [#729](https://github.com/fimoklei/maestro/issues/729) | C | *When* I edit a skill Maestro has already deployed, *I want to* carry that edit into the harness instead of hand-retyping it, *so I can* contribute a fix without import silently refusing my only copy of it. |
| See global↔local duplication | A | *When* a skill is deployed both globally and in a consuming repo, *I want to* have the cockpit flag that overlap in both views, *so I can* remove the redundant copy instead of running two unaware. |
| Guard against duplicate deploy | B | *When* I deploy a skill already deployed on the other scope, *I want to* have the cockpit warn me before it proceeds, *so I can* avoid an accidental duplicate while still keeping a deliberate one. |
| Backfill a newly-detected global tool | B, A | *When* I install a second tool after already deploying globally, *I want to* have the cockpit offer to bring the new tool up to the same set, *so I can* keep my tools in sync instead of the new one starting empty. |
| Update every behind target in one action | B, A | *When* several targets are behind the same Harness release, *I want to* move them all in one action, *so I can* stay current across my machine without opening each target's Update. Ruled out of the #833 map (#932): one target per Update keeps a half-landed Update readable. |
| Roll back a target to an earlier release | B | *When* a release I adopted turns out wrong, *I want to* move a target back to the release it had before, *so I can* undo an adoption without removing and deploying every skill by hand. |
| Replace a renamed deployed skill | B | *When* a deployed skill has a new name in the latest release, *I want to* replace the old copy with the renamed skill, *so I can* follow the Harness change without removing and deploying it by hand. |
| Connect & sync the inventory from git | A | *When* my central inventory lives in a remote repo I have not cloned, *I want to* point Maestro at its git URL as the inventory source, *so I can* set up the cockpit without cloning by hand first. |
| Act on a deploy refused by a linked destination · [#748](https://github.com/fimoklei/maestro/issues/748) | B | *When* a deploy is refused because the destination is a link, *I want to* read which path to remove and what removing it costs, *so I can* clear it in one command instead of choosing between two fixes I cannot judge. |
| Deploy into a target still holding a retired Harness · [#749](https://github.com/fimoklei/maestro/issues/749) | B, A | *When* a global target still holds copies from a Harness I have left, *I want to* keep the deploy action on its card, *so I can* replace those copies one at a time instead of facing a card that only states a fact. |
| Deploy what I just promoted, for real · [#750](https://github.com/fimoklei/maestro/issues/750) | B, C | *When* my promote has been merged and released, *I want to* have the clone catch up even though promote left an untracked copy behind, *so I can* deploy the skill instead of being told my published copy is unreleased. |
| Decide on the executables a deploy brings | B, A | *When* what I am deploying carries executables that land on my PATH, *I want to* see that before it runs and choose whether to allow them, *so I can* accept the ones I trust instead of finding out afterwards. |
| Steer a plugin as one unit | A, B | *When* a capability arrives as one plugin holding its own skills and MCP servers, *I want to* see and deploy it as that one thing, *so I can* keep it whole instead of reading it as loose skills that lost their origin. |

## DONE

All shipped **skills-only**, solo, local-first.

| Job | Main | Job story |
|---|---|---|
| Adopt a Harness release per target · [#833](https://github.com/fimoklei/maestro/issues/833) (map) → [#945](https://github.com/fimoklei/maestro/issues/945) (spec) | B, A | *When* a Harness release is published, *I want to* move a target's whole skill selection to it in one action and see which skills really changed, *so I can* stay current without updating skills one by one. |
| Keep the Harness view honest after a merge · [#911](https://github.com/fimoklei/maestro/issues/911) | C | *When* a proposal of mine is merged and the skill later changes on the default branch, or the operating system drops a file into a skill folder, *I want to* see rows only for work I still have to do, *so I can* trust the Harness view instead of reading nine true rows that mean nothing. |
| Follow a skill change from local work to release · [#827](https://github.com/fimoklei/maestro/issues/827) | C | *When* I import, edit or delete a skill, *I want to* follow its proposal, review and release with a clear next action and a way back, *so I can* make it available in Inventory without losing work or mistaking an unknown status for completion. |
| Recover from a local skill deletion · [#906](https://github.com/fimoklei/maestro/issues/906) | C | *When* I delete a skill folder in my clone and change my mind, *I want to* recover the skill with clear consequences for any proposal, *so I can* continue without guessing which work I will recover or lose. |
| Adopt apm 0.29 · [#772](https://github.com/fimoklei/maestro/issues/772)–[#775](https://github.com/fimoklei/maestro/issues/775) | B | *When* the engine moves ahead of Maestro's observed knowledge, *I want to* have the driver re-verified against the installed apm, *so I can* trust that cockpit behavior matches what the engine really does. |
| Tell a skill that changed from one that only lags a tag · [#747](https://github.com/fimoklei/maestro/issues/747) | A | *When* one skill in the Harness is released, *I want to* tell the deployed skills that actually changed from the ones that only lag a tag, *so I can* keep Behind worth reading instead of learning to ignore it. |
| Install Maestro from a clone in one command · [#717](https://github.com/fimoklei/maestro/issues/717), [#621](https://github.com/fimoklei/maestro/issues/621) | C | *When* a teammate has been given access to Maestro, *I want to* have one bootstrap script check their Node and pnpm and start the cockpit, *so I can* hand them a repo instead of walking them through a toolchain. |
| Register a consuming repo (J10) | A, B | *When* I want Maestro to see and steer a project, *I want to* make that consuming repo known to the cockpit, *so I can* see its deploy-state and deploy to it. |
| See the central inventory (J01) | A | *When* I start or plan work, *I want to* see every primitive available in the central inventory, *so I can* reuse what exists instead of guessing. |
| Deploy a skill to a repo (J06) | B, A | *When* I start or extend a project, *I want to* deploy a skill into that consuming repo, *so I can* give the assistant the right context there. |
| See per-repo deploy-state with versions (J02) | A | *When* I work across several consuming repos, *I want to* see which primitives are deployed in each and at which version, *so I can* stop guessing what each project runs. |
| See global deploy-state (J03) | A | *When* I rely on tool-level setup, *I want to* see what is deployed globally for each detected tool, *so I can* understand my baseline across all my work. |
| Deploy a skill globally (J07) | B, A | *When* something should apply everywhere, *I want to* deploy a skill to my global targets, *so I can* have it available across all my work. |
| See drift as a deployed → latest version pair (J04) | A, B | *When* the central inventory moves ahead, *I want to* see which deploys have drifted, shown as deployed → latest, *so I can* tell what needs updating. |
| Update a deploy to latest (J08) | B, A | *When* central changes, *I want to* bring a target up to the latest version from the cockpit, *so I can* avoid bumping pins by hand. |
| Register a repo without friction · [#145](https://github.com/fimoklei/maestro/issues/145) | A, B | *When* I add a consuming repo to the cockpit, *I want to* find and pick its path without friction, *so I can* register it in seconds instead of fighting the input. |
| Register repos from the sidebar without friction · [#175](https://github.com/fimoklei/maestro/issues/175) → [#163](https://github.com/fimoklei/maestro/issues/163) | A, B | *When* I register a repo after onboarding, *I want to* pick repos with the same browse picker the wizard gives me, *so I can* add several at once instead of pasting one path at a time. |
| Connect the inventory — point at a local clone (J11) | A | *When* Maestro does not yet know where my central inventory is, *I want to* point it at my local clone as the inventory source, *so I can* have the cockpit read and show it instead of dead-ending. |
| Hear why a deploy failed · [#170](https://github.com/fimoklei/maestro/issues/170) → [#180](https://github.com/fimoklei/maestro/issues/180) | B | *When* a deploy fails, *I want to* hear apm's actual reason in the cockpit, *so I can* fix the cause instead of guessing. |
| Adopt apm 0.26 · [#171](https://github.com/fimoklei/maestro/issues/171) → [#182](https://github.com/fimoklei/maestro/issues/182)–[#185](https://github.com/fimoklei/maestro/issues/185), [#191](https://github.com/fimoklei/maestro/issues/191) | B | *When* the engine moves ahead of Maestro's observed knowledge, *I want to* have the driver re-verified against the installed apm, *so I can* trust that cockpit behavior matches what the engine really does. |
| Reach an actionable cockpit on first open · [#208](https://github.com/fimoklei/maestro/issues/208) → [#216](https://github.com/fimoklei/maestro/issues/216)–[#218](https://github.com/fimoklei/maestro/issues/218), [#221](https://github.com/fimoklei/maestro/pull/221) | A, B | *When* I open Maestro before it knows my inventory or my targets, *I want to* reach a state I can act on, *so I can* get on with my errand instead of completing a setup flow first. |
| See a skill's deploy-state before deploying from Inventory · [#283](https://github.com/fimoklei/maestro/issues/283) → [#285](https://github.com/fimoklei/maestro/issues/285)–[#292](https://github.com/fimoklei/maestro/issues/292) | A, B | *When* I deploy a skill from the Inventory, *I want to* see at a glance whether it is already deployed and where, *so I can* avoid a blind or duplicate deploy. |
| Bulk-deploy staged skills to one target · [#292](https://github.com/fimoklei/maestro/issues/292) | B | *When* several skills belong on the same target, *I want to* stage them and push them in one action, reading one report, *so I can* provision that target without going skill by skill. |
| Release merged Harness changes · [#496](https://github.com/fimoklei/maestro/issues/496) → [#515](https://github.com/fimoklei/maestro/issues/515)–[#521](https://github.com/fimoklei/maestro/issues/521) | C | *When* reviewed Harness changes are merged, *I want to* see what is still unreleased and publish a version from the cockpit, *so I can* make approved skills available without inspecting refs or tagging by hand. |
| Establish the team Harness · [#498](https://github.com/fimoklei/maestro/issues/498) → [#552](https://github.com/fimoklei/maestro/issues/552)–[#557](https://github.com/fimoklei/maestro/issues/557) | A, C | *When* the team has no Harness yet or I am joining one I have not cloned, *I want to* connect from one gate that accepts a path or a GitHub URL and clones or scaffolds what is missing, *so I can* start from a real Harness without doing setup in the terminal. |
| Move a skill change into review · [#497](https://github.com/fimoklei/maestro/issues/497) → [#573](https://github.com/fimoklei/maestro/issues/573)–[#581](https://github.com/fimoklei/maestro/issues/581) | C | *When* I have changed, imported or deleted a skill locally, *I want to* promote that one skill from its Harness row, *so I can* put it in front of the team without building branches and commits by hand. |
| Remove a primitive from a target · [#158](https://github.com/fimoklei/maestro/issues/158) | B | *When* a deployed primitive is no longer needed, *I want to* remove it from its target, *so I can* keep that target clean. |
| Tell an empty target from a foreign one · [#655](https://github.com/fimoklei/maestro/issues/655) | A | *When* a target holds primitives deployed from an inventory I am not connected to, *I want to* have the cockpit name that origin instead of calling the target empty, *so I can* migrate between harnesses without the screen telling me my machine is bare. |
| Deploy what I just promoted · [#666](https://github.com/fimoklei/maestro/issues/666), [#621](https://github.com/fimoklei/maestro/issues/621) — catch-up still blocked, see [#750](https://github.com/fimoklei/maestro/issues/750) | B, C | *When* a promote of mine has been merged and released, *I want to* deploy that skill straight away, *so I can* finish the loop in the cockpit instead of pulling the Harness clone by hand in a terminal. |
| Import a skill from where it was authored · [#667](https://github.com/fimoklei/maestro/issues/667) | B | *When* I have written a skill in the directory my tools read it from, *I want to* import it from there, *so I can* follow the Harness's own contributing guide instead of copying the folder elsewhere first. |
| Scaffold a Harness clone that is ready to use · [#668](https://github.com/fimoklei/maestro/issues/668) | C | *When* Maestro has scaffolded my Harness, *I want to* have `git pull` work in that clone, *so I can* use ordinary git in it without setting an upstream first. |
| Reach an authored skill in the import picker · [#654](https://github.com/fimoklei/maestro/issues/654) | B | *When* I import a skill into the Harness, *I want to* reach the folder it is authored in without typing a path or revealing hidden items, *so I can* pick a skill instead of hunting for a dotfolder. |
| Scaffold the Harness contribution policy · [#678](https://github.com/fimoklei/maestro/issues/678) | C | *When* Maestro scaffolds a new Harness, *I want to* have its `CONTRIBUTING.md` carry the settled review and release policy, *so I can* hand teammates a repo that already tells them who reviews, what bar applies and who releases. |

Three of these jobs carry intent the job story above does not:

- **J03** groups by the tools this machine actually has, so one tool's skills
  never show up under another.
- **J07** needs no repo registered first — global deploy stands on its own.
- **J08** is mechanically a re-deploy at the latest published tag, not a
  separate operation.

## Out of scope

Valid jobs, deliberately not being done.

| Job | Reason |
|---|---|
| Reimplement install / sync / pinning / lockfile | APM owns the engine. See ADR-0001. |
| Governance lifecycle (review/approve/required) | Maestro drives git to the push and gates nothing ([#365](https://github.com/fimoklei/maestro/issues/365)); review and approval happen on GitHub. Roles, approval rules and required-vs-optional are future main job C. |
| Compounding loop (corrections → primitives) | Needs adoption and a working manual loop first; future main job D. |
| Adoption dashboards across teams | Measuring use means gathering from other people's machines; Maestro is local-only and collects nothing. |
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
