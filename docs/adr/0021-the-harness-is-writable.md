# ADR-0021 — The harness is writable in the working tree, deployable only from a tag

- **Status:** Accepted
- **Date:** 2026-08-01 (issue #352, closing write-up of the authoring-side map #343)
- **Amended:** 2026-09-06, [What Inventory says in each of its three states, now that it carries released skills only](https://github.com/fimoklei/maestro/issues/812).
- **Amended:** 2026-09-08, [What the three stages mean](https://github.com/fimoklei/maestro/issues/808) — point 10.

## Context

Maestro shipped consumer-only: connect a local clone of the central inventory,
deploy skills out of it. Two statements were bound on the strength of that, and
the authoring route breaks both.

- `CONTEXT.md` → *Inventory source*: **"Read-only; Maestro never writes back to
  it."**
- ADR-0015 point 2 puts the same no-write promise on the connect gate's success
  state and calls that the product's strongest moment.

The authoring route (#399) has Maestro commit, push and tag inside that same
repo. So the promise is not a wording slip; it is a decision that has to be
reversed on the record, in every place the repo treats as binding.

The reversal is narrower than it first looks. Maestro writes in the **working
tree** and consumers deploy from a **tag** (ADR-0003). Those are two different
states of one repo, and only the first is writable. Nothing in the consumer's
experience changes.

Three inputs arrived from tickets that closed before this one:

- **#360** — the harness shape is a single constant, `.apm/skills/<name>`, and a
  harness is recognised by `apm.yml` in the repo root. `agent-harness` is retired
  rather than migrated, so no repo carries two shapes. #360 ruled that the shape
  belongs in *this* ADR, not in ADR-0003.
- **#347** — the states had to be visible on a screen before they could be
  named. The Harness view shows movements in three tables: *Pending release*,
  *Pending review*, *Pending promotion*.
- **ADR-0019 §4** — "harness" means the agent platform in APM's glossary and the
  inventory repo here, recorded there as **drift** and explicitly left for this
  ADR to settle.

## Decision

**The harness is one repo in two states. Maestro writes in the working state;
consumers deploy only from the released state.**

1. **Working harness** — the repo as it stands right now, uncommitted edits
   included. Maestro writes here, and only here. It carries no quality promise.
2. **Released harness** — the harness at its latest published tag. The only
   thing consumers deploy from, and the only state the curated bar applies to.
3. **The curated bar moves, it does not disappear.** `CONTEXT.md`'s
   *Curated / Production-ready* rule now attaches to the released harness.
   "Central" keeps meaning curated, because a consumer never sees anything else.
4. **The harness shape is `.apm/skills/<name>`**, and a harness is recognised by
   `apm.yml` in the repo root — APM's own marker, never a skills directory.
   Grounds and rejected alternatives are in #360.
5. **"Harness" is this repo's name**, in the glossary as well as on the screen.
   `CONTEXT.md` gains it as a term with an *Avoid* line naming APM's opposite
   meaning. This resolves ADR-0019 §4 from drift to a decision.
6. **`Harness` and `Central inventory` both stand.** They are the same repo seen
   from two sides — the author's and the consumer's. Neither is renamed.
7. **Inventory reads the latest published release**, including skill names and
   descriptions. A never-released skill is absent. Local edits do not change
   its released description; a local deletion does not hide it until released.
8. **Empty and unreadable are different outcomes.** A confirmed empty Inventory
   shows the approved empty state with **Open Harness**. A failed read shows
   **Inventory not read**, "Re-read Inventory to try again." and
   **Re-read Inventory**. It shows no skill list, deploy actions or zero count,
   including when an earlier read is cached. A read failure never means the
   Harness is not configured.
9. **A successful release refreshes Inventory automatically.** If that read
   fails, the unreadable state applies. Zero skills is a valid result for
   connection checks and tests; it must be established by a successful read.
10. **Stage memberships are independent.** Each of *Pending proposal*, *Pending
    review* and *Pending release* answers its own question about a different
    piece of work, so one skill may sit in several stages at once, with one row
    per stage. This replaces #518's rule that a skill appears in at most one
    table — a rule no ADR ever recorded, held only by `classify-movement.ts`.
    Membership is per stage, and so is a deletion fact: deleting locally never
    relabels an earlier change in another stage. Where a stage's read failed,
    its membership is unknown, never empty.

## Consequences

- **ADR-0015 is amended, not superseded.** Its headline — first run is a connect
  gate, not a wizard — is untouched. Its read-only promise is rewritten to the
  narrower one that is true.
- **ADR-0003 gets a correction, not an amendment.** Its decision (tag-pinned
  refs) never changed; its examples describe the retired `agent-harness` shape
  and its *Decision* never fixed the subpath.
- **Drift is unchanged.** ADR-0005 and ADR-0007 measure a target against tags,
  which apm resolves. A target that is current with the released harness is not
  drifted, however far the working harness has moved on. That gap is the
  *Pending release* table (#347), not a third drift facet.
- **ADR-0016 still governs Inventory's presentation.** This amendment defines
  which Harness state supplies its collection and how empty and failed reads
  differ; it does not redesign the existing list or detail pane.
- **Point 10 costs the exclusive classifier.** `classifyMovement` returns one
  state per skill; the read model has to return a membership per stage instead.
  Whether a request exists for a proposal is read through `gh` (ADR-0029), while
  content comparisons stay on tree hashes.
- Issue #557 makes the connect gate's success copy outcome-specific: found keeps
  the deploy no-write promise, while joined and scaffolded describe their
  writes and landings honestly.
- A newcomer who reads APM first meets "harness" twice, at opposite ends of the
  pipe. The *Avoid* line is the whole mitigation; the word is on a screen and a
  glossary cannot outvote that.

## Rejected alternatives

- **One name for the repo — retire "Central inventory".** Tidier glossary. It
  costs about fifty occurrences across eight files including user-facing
  connect-gate copy and its tests, which is build work, and this ticket's own
  terms forbid deciding build questions here.
- **New nouns for the two states — `draft` / `catalogue`, or `published`.**
  Rejected on two counts: `CONTEXT.md` already lists "published" under *Avoid*,
  and #347 put a **release** button on the screen. The screen word wins. Two
  adjectives on one noun also add no vocabulary at all.
- **A third drift facet for unreleased work.** It collapses two questions that
  live on two screens — *is my repo behind?* and *is the team's work out yet?*
- **Rename the Harness view to keep `harness` reserved for APM.** Aligns with the
  engine, re-opens #347, and puts two entries reading "Inventory" in one sidebar
  — the outcome #347 rejected.
- **A separate ADR for the harness shape.** Rejected on #360: nobody looks for a
  directory constant in an ADR of its own, and ADR-0003 is consumer-side.
