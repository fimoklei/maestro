# ADR-0036 — A Harness may carry one list of categories

- **Status:** Accepted
- **Date:** 2026-11-15 (spec #1900; decided in #1877, #1880, #1883, #1895)
- **Amends:** ADR-0034

## Context

ADR-0034 kept every category in the operator's own config, one list per
Harness. A teammate who connects the same Harness, or the operator on a second
computer, starts with an empty list and sorts the same Inventory again (#1874).
ADR-0034 rejected `.maestro/categories.yml` as the place an operator's list
lives: each change would need a proposal, a review and a release. That cost
fits a list proposed on purpose for the team, not every edit.

## Decision

**A Harness may carry one optional list, the Harness categories, in
`.maestro/categories.yml`, read from the Released harness. The operator's own
list stays as ADR-0034 decided.**

1. **The file.** `version: 1`, `categories` (a list of names) and `assignments`
   (`{ type, name, category }`, an item named as in ADR-0034 §1). Maestro reads
   it at the latest release tag only; a Harness without the file or without a
   release carries no Harness categories. One core module reads and writes it;
   a file with an error never reads as an empty list.
2. **Copy, not follow.** The operator copies the Harness categories into their
   own list once. Afterwards the own list changes only through the operator.
3. **A proposal outside the per-primitive model.** The operator proposes their
   whole list as one pull request on its own branch. ADR-0034 rejected a new
   proposal kind for every edit; this one is accepted because the list is
   proposed on purpose and the curator reviews it like any change.
4. **Exception to ADR-0035.** After **Withdraw from release** of the categories
   file, Maestro also sets the file in the clone's working tree back when it
   equals the withdrawn version; otherwise the stale file stops catch-up.

## Consequences

- A teammate can start sorted, and a release can change the team's list; the
  cockpit signals such a change, and the operator decides whether to copy it.
- Instant edits stay personal; sharing costs one review and one release.
- This Maestro reads a later file format as a file with an error, and its pull
  request replaces that file with `version: 1`. The curator's review is the
  only guard.
