# ADR-0028 — A missing released skill is no longer released

- **Status:** Accepted — narrows ADR-0027 for a deployed skill name absent from the latest release
- **Date:** 2026-09-04 (issue #770)

## Context

ADR-0027 reads a deployed skill as **Behind** when its name is absent from the
latest release. That is safe when the content check cannot answer, but wrong
when both release trees prove the name disappeared. The row then offers an
update that deploys the missing name again and cannot succeed.

The missing name does not prove why it disappeared. The Harness may have
removed it, renamed it, or renamed and changed it together. **Deprecated**
would claim intent the Harness does not record.

## Decision

A deployed skill whose name exists at its deployed tag and is absent from the
latest release reads **No longer released**. This is the old name's state even
when an identical tree under a new name proves a rename. If either tree cannot
answer, the repository origins differ, or the deployed name cannot be proven
at the deployed tag, the row keeps ADR-0027's **Behind** fallback.

The row shows only its deployed version. It offers no **Update skill** action,
because no latest version of that name exists. The existing **Remove skill**
action stays in the actions menu. Replacing a renamed deployment with its new
name is a separate job.

A Target containing a **No longer released** skill reads **Attention**, which
outranks **Behind**, and the skill does not enter the Behind count. This applies
to consuming repositories and global Targets. Inventory remains a list of
skills in the latest release, so it does not invent a row for the missing name;
bulk update does not include that deployment.

## Consequences

- Deploy-state states the proven absence without guessing at author intent.
- A failed or incomplete content check never becomes a removal warning.
- ADR-0027's rule that a rename reads **Behind** is superseded for the old,
  absent name. Replacement stays separate from truthful status reporting.
- Issue #749 remains separate: it covers a Target holding deployments from a
  different Harness, not one missing skill in the connected Harness.
