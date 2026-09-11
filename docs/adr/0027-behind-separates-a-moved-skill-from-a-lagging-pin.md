# ADR-0027 — Behind separates a moved skill from a lagging pin

- **Status:** Accepted — extends ADR-0007; narrowed by ADR-0028 for an absent skill name; amended by ADR-0031 (see *Amendment*)
- **Date:** 2026-09-04 (issue #747, found by walking the cockpit, #711)

## Context

ADR-0019 §1 records the deliberate departure that causes this: the git tag is
the only version number, and a consumer pins one skill by subpath at a tag of
the whole **Harness**. So publishing a release moves the latest tag for every
deployed skill at once.

`apm outdated` compares the pinned tag with the latest tag. Every release
therefore puts every deployed skill on **Behind**, whether its content moved or
not. At five skills that is a curiosity; at forty-seven it destroys the signal,
and the reader learns to ignore the word.

ADR-0001 forbids recomputing the version diff, so Behind stays `apm outdated`'s
judgment. But the content question is not a version computation. ADR-0021
already established the answer: a skill directory is one unit, and its git tree
hash is the whole of its content. `diffSkillTrees` reads that delta for the
*Pending release* table, and skill trees are readable at any ref.

## Decision

**Behind claims a newer release exists, and nothing more.** A second reading
carries the content fact.

1. **Two readings.** A deployed skill whose tree differs between the pinned tag
   and the latest tag reads **Behind**. One whose tree is identical at both tags
   reads **Older tag**. This ADR originally counted a rename as moved and read
   every pinned name absent at the latest tag as **Behind**. ADR-0028 supersedes
   that rule for the old, absent name: it reads **No longer released** when the
   two release trees prove the absence.
2. **Only a moved skill counts.** The per-target roll-up counts moved skills
   only, and a target holding nothing but **Older tag** skills does not raise
   the drift indicator. One number, not two. The lagging pin is stated on the
   row and nowhere else; a second, quieter count on the target is rejected, not
   forgotten.
3. **One read, one answer.** The two facts join before the row renders. A status
   that changes under the reader's eyes is worse than a slower first paint.
4. **Behind is the fallback.** Where the content question cannot be answered the
   row reads **Behind**. That is the honest statement of what is known, so no
   third status exists for an unanswered content check. It covers four cases:
   no clone to read trees from, the pinned tag unreadable in that clone, the
   latest tag unreadable in it, and a pin naming a repository other than the
   connected Harness.
5. **The trees answer for the same repository, or not at all.** The latest tag
   is a remote fact (`apm view`) and the trees are read locally, so the join
   fetches tags before it reads and compares the lockfile's `repo_url` with the
   clone's origin. A skill pinned to another repository never gets a content
   answer; its name matching one here proves nothing.
6. **The action stays on both.** The pin genuinely lags either way, and moving
   it rewrites `apm.yml`. Maestro stops urging it, it does not withdraw it. A
   future bulk update acts on moved skills only.

## Consequences

- `CONTEXT.md`'s **Version drift** term gains the two readings, and the screen
  names gain **Older tag**.
- The join lives in its own use-case in `core`. The version-drift use-case keeps
  one owner — `apm outdated` — and web keeps no product logic
  (`architecture.md`).
- Drift now depends on reading the **Released harness**'s git trees and on a tag
  fetch, where it previously depended on `apm outdated` alone. One `ls-tree` per
  ref answers for every skill of a target, so the cost is two reads, not two per
  skill.
- ADR-0028 covers a deployed skill name absent at the latest tag. It has
  nothing to update to, which is a different fact from **Behind**.

## Amendment — 2026-09-11, ADR-0031

A target now follows one Harness release with one selection (ADR-0031), so a
pin lags per target, never per skill. What changes:

- **Older tag retires.** The two readings of point 1 become the two sections
  of the **Update target** preview, **Changed** and **Unchanged**, and the
  count on the target's Release head (`2 of 5 skills changed`). No row carries
  a version status of its own.
- **Point 2 survives as that count.** Only changed skills count; a release
  that changes no selected skill is still adoptable and reads **No content
  changes** (#932).
- **Point 4's fallback moves to the head.** Where the content question cannot
  be answered, the head shows both releases with the meta line *Changes could
  not be read* (#932) instead of a row reading **Behind**.
- **Point 6 is replaced.** The action is **Update target** on the target, and
  it moves the whole selection at once; the per-skill *Update skill* button
  retires. A bulk update acting on moved skills only no longer exists — a
  release is adopted whole.

Points 3 and 5 stand unchanged.
