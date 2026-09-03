# ADR-0026 — A deployed copy may be carried back, but only into the skill it came from

- **Status:** Accepted
- **Date:** 2026-09-03
- **Narrows** the refusal decided in [#626](https://github.com/fimoklei/maestro/issues/626) — a deployed copy is no longer refused outright.
- **Resolves** [the spec for carrying an edited deployed copy back](https://github.com/fimoklei/maestro/issues/729), ticket [#732](https://github.com/fimoklei/maestro/issues/732).

## Context

A skill is authored in the Harness and deployed from a tag (ADR-0021). The
author notices a fault while working in the repository the skill was deployed
to, and fixes it there, because that is where the fault showed itself.

Until now the cockpit had no route for that fix. **Import skill…** refused the
folder twice: once because a deployment record claimed it (#626, which exists so
Maestro's own output cannot be copied back in as a new skill), and once because
the Working Harness already held a skill of that name. The only way through was
to open the Harness clone and retype the change.

Both refusals were right about the general case and wrong about this one. The
folder is not foreign output: it is this Harness's own skill, deployed by this
Harness, edited by its author.

## Decision

A deployed copy may replace the Harness skill it came from, and nothing else.

A folder qualifies only where one deployment record entry proves **both** of:

1. **Origin.** The entry's `host` and `repo_url` name the same repository as the
   connected Harness's own origin, compared through `parseGitOrigin` on both
   sides so two spellings of one remote are one origin (ADR-0014).
2. **Name.** The entry's skill name is a name the Working Harness already holds
   under `.apm/skills`.

Either half alone qualifies nothing. Where the entry cannot prove both, the
folder is refused exactly as before.

Three consequences follow, and each is deliberate:

- **`repo_url` is optional in the lockfile schema, and absent means refused.**
  A pre-0.20.0 entry proves no origin, and an unprovable folder is not treated
  as ours. This is the same fail-closed rule the write path already applies to
  lockfile data it cannot read (#58).
- **An unreadable or unparseable record still blocks nothing.** It claims no
  folder, so it neither refuses an import nor opens an update. The rule from
  #667 is untouched: a hand-authored skill living where a deploy would write is
  still an ordinary import.
- **The route can never introduce a skill.** It replaces a skill the Harness
  already holds with a copy the Harness itself produced. Nothing enters the
  Harness through it that did not leave it first.

The replacement is whole-folder and atomic (ADR-0002's ports; the staging and
rename shape in `copy-skill-folder`, #731). Files the Harness held and the
edited copy does not are gone, and those deletions are what the reviewer sees.

**The guard on the write.** An update is refused while the Harness's own folder
for that skill differs from the commit it sits on, and an unreadable comparison
counts as differing. Uncommitted work has no second copy anywhere: replacing it
would destroy it with no way back. Committed work needs no such guard — git
keeps it, the review reads it, and `promote-skill` already refuses a genuine
collision at push time.

Everything after the write is the route that already exists. The Working
Harness is a git clone, so a replaced folder shows up as a **Pending proposal**,
travels through **Propose change** and review, and ships in the next
**Release** (ADR-0021). The deployed copy the author edited stays as it is; the
target reads **Behind** after the release, and the author brings it up to date
themselves.

## Alternatives rejected

- **Keep the refusal absolute.** Honest, and it leaves the author retyping their
  own change by hand. The refusal existed to keep foreign output out of the
  Harness, not to keep the author out of their own skill.
- **Match on the skill name alone.** Cheap, and it would let a copy deployed
  from someone else's Harness overwrite a skill of ours that happens to share
  its name.
- **Match on where the folder sits.** Rejected in #667 already: a folder under a
  deploy destination is not evidence of a deploy. Provenance is the record.
- **Merge rather than replace.** A diff engine, three-way merge and hunk
  selection, to avoid a review the author already has to do. The review is where
  the change is read.
- **Delete the folder, then copy.** A copy that failed halfway would leave the
  skill gone from the Harness entirely.
- **Refuse only where the Harness's uncommitted work touches the same files.**
  A narrower guard, resting on a per-file comparison the port does not give and
  on the author remembering which files they had touched. The tree hash the
  movement read already computes answers the whole question.
