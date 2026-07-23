# Inventory Filter Remount Refetch

Narrowing the inventory table — via the name search (#287) or the type filter
(#288) — removes the filtered-out rows from the DOM and restores them when the
query/filter is cleared. Each restored `DeploySkillAction` remounts its
deploy-state hooks, and with deploy-state's `staleTime` of 0 that remount
triggers one background refetch of the (already-cached) deploy-state. The shared
query keys dedupe concurrent remounts to a single request per resource, so the
effect is one background revalidation when a narrow is cleared — not one per row.

This is accepted as a documented trade-off rather than fixed.

## Why this is out of scope

There is no user-visible effect: the refetched data is already on screen, the
inventory list itself (`useInventory`) is never refetched, nothing hangs, and
nothing is slow. The read is a cheap local lockfile read. Severity is low and
this is not a correctness bug.

Two fixes were weighed during triage and both rejected:

**Give deploy-state a non-zero `staleTime`** so a remount serves cache. Rejected
because deploy-state is deliberately kept live (no `staleTime`) so an external
`apm` change — a lockfile edited outside Maestro — shows on open/focus. See the
source comment in `packages/web/src/deploy-state/use-deploy-state.ts`. Always-live
freshness is the intended behavior and weighs heavier than avoiding one invisible
refetch. Drift already accepts a 5-minute `staleTime` only because a drift check
shells out and is not free; the cheap lockfile read has no such excuse.

**Keep rows mounted and hide narrowed-out ones with CSS** so no remount occurs.
This preserves the always-live freshness but tangles three concerns the table
currently keeps separate — the filter, the sort, and the explicit empty state —
into one render path that must always draw the full row set. That is
middle-weight work with real regression risk, spent on a problem no user
observes. It fails the cost/benefit test against the low severity.

The spirit of #287's acceptance criterion ("search operates on the loaded
inventory only, no refetch") is knowingly relaxed for a *different* resource
(deploy-state/drift) in exchange for keeping that resource always live.

## If this starts biting

Recorded so the reasoning is not lost, not forbidden forever. If the table grows
to hundreds of rows or many filters, the invisible refetch could become
observable — then the CSS-hide fix (which keeps freshness intact) becomes worth
its cost. Delete this file and open a fresh issue if that day comes.

## Prior requests

- #300 — "Inventory table: filtering unmounts rows, triggering deploy-state refetches"
