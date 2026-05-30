# Job Map — Maestro

## Purpose

The canonical map of user jobs for Maestro. Used as a **coverage check**:

- which main jobs exist;
- which subjobs sit under each main job;
- which subjobs are in the active MVP, which are future, which are out of scope.

The roadmap decides which subjobs ship in a release. This file decides which jobs exist at all.

Subjob IDs (`J01`, `J02`, …) are only assigned when a subjob enters an active MVP. Future subjobs are listed by name until they get picked up.

The MVP1 bet: one person can **see** their whole agent setup and **steer** it (deploy/update primitives and bundles, local or global) from one cockpit.

---

## Jobs

| Job | Type | Description | Ladders up to |
|---|---|---|---|
| **A — Know what I have and where it runs** | Main | When I manage an agent setup across projects and tools, I want to see what I have centrally and what is deployed where, so that I can trust, reuse, and debug my setup instead of guessing. APM scatters this across lockfiles and configs; the mental model is lost. | — |
| ↳ J01 — See the central inventory | MVP1 | When I start or plan work, I want to see every primitive (skill/hook/MCP) available centrally, so that I know what I can reuse. | A |
| ↳ J02 — See per-repo deploy-state with versions | MVP1 | When I work across several repos, I want to see which primitives/bundles are deployed in each repo and at which version, so that I am not guessing what each project runs. | A |
| ↳ J03 — See global deploy-state | MVP1 | When I rely on tool-level setup, I want to see what is deployed globally for Claude Code and Codex, so that I understand my baseline across all work. | A |
| ↳ J04 — See drift | MVP1 | When central changes, I want to see which deploys lag behind, so that I know what needs updating. | A, B |
| ↳ Explain why a primitive is deployed | Future | — | A |
| ↳ Search and preview the inventory | Future | — | A |
| ↳ Adoption view across a team | Future | — | A, C |
| **B — Get the right capabilities to the right place** | Main | When a project or tool needs capabilities, I want to provision the right primitives there without per-repo handwork, so that each context has what it needs and stays current. | — |
| ↳ J05 — Compose a bundle from the inventory | MVP1 | When I have recurring sets of primitives, I want to assemble a bundle from central, so that I can deploy them together. | B |
| ↳ J06 — Deploy a primitive/bundle to a repo (local) | MVP1 | When I start or extend a project, I want to deploy a primitive or bundle locally to that repo, so that the assistant has the right context there. | B, A |
| ↳ J07 — Deploy a primitive/bundle globally | MVP1 | When something should apply everywhere, I want to deploy it globally for Claude Code and Codex, so that it is available across all my work. | B, A |
| ↳ J08 — Update a deploy to latest | MVP1 | When central changes, I want to bring a repo or global target up to date from the cockpit, so that I am not bumping pins by hand. | B, A |
| ↳ J09 — Add or edit a primitive in central | MVP1 | When I create or improve a skill/hook/MCP, I want to add or edit it in the central inventory, so that it becomes reusable and deployable. | B |
| ↳ Remove / undeploy a primitive from a target | Future | — | B |
| ↳ Recommend primitives from project context | Future | — | B |
| **C — Curate team contributions into production-ready central** | Main (future) | When teammates contribute custom primitives, I want them to enter centrally and be curated before they become deployable, so that only production-ready capabilities reach projects. The governed lifecycle — review, approval, adoption visibility — is the team/org differentiator. | — |
| ↳ Submit a primitive for review | Future | — | C |
| ↳ Approve and publish a primitive | Future | — | C |
| ↳ Manage ownership and required/optional scope | Future | — | C |
| ↳ Deprecate outdated primitives | Future | — | C |
| ↳ Shadow-skill detection | Future | — | C |
| **D — Turn repeated corrections into reusable capabilities** | Main (future) | When the same correction recurs (in review, in incidents), I want it to become a reusable primitive, so that the setup compounds and the correction cost is paid once. This is APM's blind spot and Maestro's strongest long-term value. | — |
| ↳ Detect repeated corrections | Future | — | D |
| ↳ Draft candidate primitives from corrections | Future | — | D |
| ↳ Convert incident lessons into primitives | Future | — | D |
| ↳ Measure whether a primitive reduced mistakes | Future | — | D |

---

## Out of scope

Valid jobs, deliberately not in MVP1.

| Job | Reason |
|---|---|
| Reimplement install / sync / pinning / lockfile | APM owns the engine. See ADR-0001. |
| Governance lifecycle (review/approve/required) | Solo has no curation-by-others need yet; future Job C. |
| Compounding loop (corrections → primitives) | Needs adoption and a working manual loop first; future Job D. |
| Adoption dashboards across teams | Needs a team before adoption means anything. |
| Support every AI coding tool | Two tools (Claude Code, Codex) first; breadth later. |
| Auto-generate primitives from PR comments | Needs data integration and a working manual loop first. |
| SaaS backend / RBAC / audit / compliance | Too heavy before solo daily value is proven. |
