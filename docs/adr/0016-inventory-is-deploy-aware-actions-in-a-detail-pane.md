# ADR-0016 — Inventory becomes deploy-aware; actions move to a detail pane

- **Status:** Accepted
- **Date:** 2026-07-22

## Context

A prototype redesign of the Inventory view
reshapes the skills list into a scan table with per-row deploy information and
an expanding detail pane. Charting it with wayfinder on 2026-07-22, the first
step was to separate what already ships from what is new, then lock the one
architectural question before any build slices.

Two user use cases framed the decision:

- **UC1 — see what I have deployed where.** Target-first: "what is in repo
  acme-web?" Served today by the Deploy-state landing view.
- **UC2 — deploy a skill from Inventory without knowing whether it is already
  deployed.** The deploy-blind risk: nothing on the Inventory scan surface says
  a skill is already present somewhere before you act.

Today the two live as separate views: Deploy-state (target-first landing, `/`)
and Inventory (`/inventory`, a skills list whose deploy control is inline per
row). The Deploy-state landing already fans a drift check out across every
target — global plus one card per registered repo — so the expensive read
(`apm outdated` per target, networked; ADR-0005) is already paid on that
screen. The inline deploy control already computes an "already synced" chip,
but only *after* a target is picked.

Key finding from the cost check: the prototype's per-row deployed/drift data is
the **same** data the Deploy-state landing already loads. The web layer caches
it with TanStack Query under shared keys, which dedupes the reads (ADR-0005,
ADR-0007). Surfacing it in Inventory therefore adds **no new server cost** and
cannot disagree with Deploy-state — both read the same cached queries. The cost
objection to a deploy-aware Inventory does not hold.

## Decision

**Inventory becomes deploy-aware, scoped to presentation on existing
skills data. The table shows; a detail pane does.**

1. **The table stays a pure scan surface.** Each row gains a `deployed` column
   (`→ N targets` / `not deployed`) plus a per-row drift chip. This answers UC2
   at a glance: you see whether a skill is already deployed *before* you act,
   not only after picking a target.
2. **Actions and detail move into an expanding detail pane.** Selecting a row
   opens a pane carrying the per-primitive "deployed to" list and the deploy
   control. Looking and doing are separated: the table is "see", the pane is
   "do".
3. **The pane replaces today's inline per-row deploy control.** The
   "already synced" / behind logic and the force-reinstall path move into the
   pane with it.
4. **The target-first Deploy-state view stays, alongside Inventory.** UC1
   remains its job; Inventory does not reimplement a target-first browser. The
   pane's "deployed to" list is a per-primitive lens on the same data, serving
   the deploy moment (UC2), not a second full deploy-state view.
5. **Scope is skills only, on endpoints that already exist.** Non-skill
   primitive types (hooks, MCP servers), bundles, and the table's other new
   affordances (search, filter, sort, bulk deploy) are out of this decision's
   scope. They remain future board work and need no architectural decision to
   proceed — they are downstream build, not a fork.

## Consequences

- **No new server cost.** The deployed/drift data is already loaded by the
  Deploy-state landing; Inventory reads the same deduped query cache. Cost
  scales with the number of targets, unchanged by this decision.
- **Deploy gains one step.** It moves from one-shot inline to select-row → pane
  opens → deploy. Accepted deliberately as the price of a calm scan surface;
  the fast path is slightly longer.
- **The same truth shows two ways** — target-first in Deploy-state,
  primitive-first in Inventory. Because both read the same cached queries, they
  cannot diverge.
- **The current deploy control is refactored, not rebuilt.**
  `deploy-skill-action.tsx` and its synced/behind logic relocate into the pane.
- **Two surfaces stay maintained** (Deploy-state page plus a deploy-aware
  Inventory) rather than collapsing into one.

## Rejected alternatives

- **Deploy-aware Inventory without the detail pane** — keep deploy inline per
  row, add only the `deployed` column. The cheapest option, and it already
  kills UC2's blind-deploy risk at a glance. Rejected because the redesign
  deliberately separates "see" (the table) from "do" (the pane); inline actions
  keep cluttering the scan surface. (Recommended in the grill, overridden in
  favour of keeping the pane, whose real role is to host the deploy action.)
- **Merge Deploy-state entirely into Inventory** — delete the target-first
  view and answer "what is in repo X" by filtering the primitive-first table.
  Rejected: UC1 is genuinely target-first and a primitive-first table serves it
  poorly; both lenses earn their place.
- **Extend the inventory endpoint to carry deploy-state and drift server-side.**
  Rejected: it would rebuild the fan-out ADR-0005 deliberately split off, while
  the client already holds both reads in cache — the join is a cheap
  client-side pivot, not a new server read.
