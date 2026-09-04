# ADR-0027 — Behind separates a moved skill from a lagging pin

- **Status:** Accepted — extends the reading of version drift set by ADR-0007
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
   reads **Older tag**. A rename counts as moved.
2. **Only a moved skill counts.** The per-target roll-up counts moved skills
   only, and a target holding nothing but **Older tag** skills does not raise
   the drift indicator. One number, not two.
3. **One read, one answer.** The two facts join before the row renders. A status
   that changes under the reader's eyes is worse than a slower first paint.
4. **Behind is the fallback.** Where the content question cannot be answered —
   the pinned tag unreadable, no clone to read trees from — the row reads
   **Behind**. That is the honest statement of what is known, so no third status
   exists for an unanswered content check.
5. **The action stays on both.** The pin genuinely lags either way, and moving
   it rewrites `apm.yml`. Maestro stops urging it, it does not withdraw it. A
   future bulk update acts on moved skills only.

## Consequences

- `CONTEXT.md`'s **Version drift** term gains the two readings, and the screen
  names gain **Older tag**.
- The join lives in its own use-case in `core`. The version-drift use-case keeps
  one owner — `apm outdated` — and web keeps no product logic
  (`architecture.md`).
- Drift now depends on reading the **Released harness**'s git trees, where it
  previously depended on `apm outdated` alone.
- A deployed skill *removed* at the latest tag is not covered here: it has
  nothing to update to, which is a different fact. That is #770.
