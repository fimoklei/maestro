# Local skill restoration uses the last local commit

- **Status:** Accepted; confirmed with Michiel during the #888 interview.
- **Date:** 2026-09-10

Maestro offers restoration of a locally deleted skill folder as a recovery
exception to #401's rule that authors edit folders outside the cockpit. It
restores the skill from the clone's last local commit (`HEAD`), so recovery
does not silently introduce newer remote work or select an older release.
This cannot recover pre-deletion edits absent from that commit; the
confirmation must state that limit.

The existing #809 decision still applies: local restoration does not
automatically update or withdraw a proposal. The author chooses those actions
separately.

Restoration may proceed when GitHub is unreachable, provided the local
recovery copy can be fully verified and read. If that local check fails,
restoration refuses. An unavailable proposal check must remain visibly
unknown; it does not block this local action.

The action and confirmation button read **Restore skill**; the dialog title
reads **Restore {skill}**. The confirmation states:

> Restore this skill folder from your last local commit. Changes not included in that commit will not be recovered.

When a proposal exists, add:

> Your proposal remains unchanged.

Restoration refuses when this skill has staged differences from local `HEAD`;
the author must unstage them in their Git tool first. Unrelated staged or
uncommitted changes do not block restoration. The real index remains unchanged.

The entire skill folder must be absent. Any existing entry at that path,
including one created during restoration, prevents replacement. Restoration
also refuses during a merge, rebase or unresolved conflict, and in a sparse
checkout.

**Restore skill** appears in the skill's action menu. The **Deleted locally**
detail also names the recovery action. Availability depends on verified local
absence and recovery content, not the review stage. Restoration remains
reachable after a deletion is proposed; it does not reverse a merged deletion
on GitHub either. Maestro does not infer whether a deletion was accidental.

On success, show **Skill restored** and:

> Restored from your last local commit.

Re-read local facts. A local change disappears from **Pending proposal** only
when no difference remains; differences from the remote or proposal stay
visible. An open deletion proposal remains open, with **Your proposal remains
unchanged** and the existing update and withdrawal actions. Failed remote
checks leave review facts unknown or stale while local success remains valid.

This records planning decisions for [#888](https://github.com/fimoklei/maestro/issues/888),
not implemented behavior.
