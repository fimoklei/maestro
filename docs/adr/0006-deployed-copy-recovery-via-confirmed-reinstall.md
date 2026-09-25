# ADR-0006 — Recovery for a not-proven-clean deployed copy: confirmed reinstall, not refuse-only

- **Status:** Accepted
- **Date:** 2026-06-18
- **Amended:** 2026-09-12 (#952) — one shared guard for every write, equality
  with the chosen release, and consent as a signed receipt rather than a flag.

## Context

The destination guard (#56/#57, refuse-only) protects against a same-ref `apm
install` silently resetting a locally-edited deployed copy. It classifies the
deployed subtree against the lockfile's `deployed_file_hashes` and, on anything
it cannot prove clean, returns a hard error — the deploy or update is refused.

That refuse-only stance made the one-click Update (PR #55) unusable for
real deployments:

- **Unverifiable** — any skill deployed before apm 0.20.0 has no
  `deployed_file_hashes`. After the 0.16 → 0.20 upgrade, the *first* Update of
  **every** existing skill is refused ("remove the deployed copy and deploy
  fresh"). That is exactly the per-repo terminal handwork Maestro exists to kill.
- **Diverged via deletion** — deleting the skill's folder in the Claude Code skills folder classifies as
  `diverged`, and the cockpit says *"The deployed copy has local edits.
  Deploying would overwrite them."* That is factually wrong (nothing is on disk
  to overwrite) and it blocks the re-deploy that would restore the copy.

The deeper question is what the product owes a hand-edited deployed copy. The
glossary already answers it: a deploy *"is generated, never hand-edited"*
(`CONTEXT.md` → Deploy), and a local edit is **content drift** to reconcile, not
treasured work. The thing worth protecting lives in the central inventory, not
in the deployed copy. The only real hazard is the *silence* of apm's reset — not
the loss itself.

## Decision

**The deployed copy is non-precious generated content. The guard warns and lets
the user proceed in the cockpit; it never dead-ends them into a terminal.**

Behaviour by destination state:

- **Nothing on disk** (empty subtree, fully deleted copy) → **proceed silently**,
  identical to a first deploy. There is nothing to overwrite, so the old "local
  edits" refusal was simply a bug. A *partial* deletion (some recorded files
  gone, some remain) is **not** "nothing on disk" — it routes to the warn path
  below, because a surviving file may carry an edit we would otherwise reset.
- **Clean** → proceed, unchanged.
- **Equal to the chosen release** → proceed. A copy the record no longer
  describes, whose complete folder is byte-for-byte the release about to be
  installed, has nothing to lose: an upstream change is not the reader's edit.
  The comparison covers the whole folder, so an extra, missing or differing file
  anywhere keeps the copy protected, and a release the cockpit cannot read earns
  no pass at all (fail closed, #952).
- **Not provable clean** — verified edits/extra files (**Local edits**) **and**
  **Unverified** (pre-0.20.0, no baseline) → **confirm-and-proceed**, not refuse.
  The cockpit surfaces the warning with an inline action button ("Deploy
  again"); confirming re-runs the deploy carrying the **receipt** the refusal
  handed back. One code path, one affordance.
  The two states share the *action* but carry **distinct messages**, because the
  information differs:
  - *verified edits* — "The deployed copy has local changes that never went
    through central. Updating discards them and reinstalls at the latest tag."
    (We know there is drift.)
  - *unverifiable* — "This copy predates content tracking, so local changes
    can't be checked. Updating reinstalls fresh at the latest tag; any local
    changes are discarded." (We cannot tell; most copies are pristine.)

Scope: one `LocalCopyGuard` classifies and licenses every write — deploy,
remove, the per-skill uninstall a migration runs, and the Update slices —
so the behaviour is **identical at every entry point**. The semantics are the
same (you are about to overwrite or delete a not-proven-clean copy); splitting
them would be two mental models for one fact.

Consent is a signed receipt, not a flag (#952). The refusal mints it over what
it just read: the act, the target, and every copy's name, tool and verdict. The
write re-reads the copies and accepts only a receipt matching what it finds now,
so content that changed since the reader looked retires their permission and the
question is restated. Nothing is stored: the proof travels with the request
(ADR-0020). A refusal no consent can clear — an unreadable copy, a malformed
lockfile — mints none, so the cockpit never offers a way past a state it could
not read.

Affordance shape: an **inline button next to the warning text**, not a modal.
Styled UI lands later in one pass (ADR-0004, `frontend.md`: *"do not style ahead
of working behaviour"*), so a polished confirm dialog would be built twice.

## Consequences

- The one-click Update is usable for every pre-0.20.0 deployment again, via a
  one-time confirmed reinstall per skill. After that update apm writes
  `deployed_file_hashes`, so the skill becomes verifiable forever — the
  unverifiable state is transient and self-healing. No bulk "update all" is
  needed (YAGNI).
- The guard stops silently destroying *and* stops dead-ending. It now occupies
  the middle ground the glossary implies: warn loudly, let the owner of
  non-precious generated content decide.
- A consented-overwrite path exists on the deploy use-case and its transport
  (`confirmedCopyReceipt`). Only this server's own refusal can mint the token it
  takes, so the override cannot be asserted by a caller — it is the deliberate,
  content-bound answer to a question the cockpit asked, not a default. The
  earlier `force: true` flag it replaces could outlive the content it was given
  for (#952).
- Known residual: the legacy unrecorded `.agents` false-positive (#64) turns a
  clean-but-untracked copy into a `diverged` warning rather than a hard refusal —
  an unnecessary confirm prompt, no longer a dead end. Left to the #64 backlog.

## Rejected alternatives

- **A boolean `force` flag (the original 2026-06-18 decision).** Amended by
  #952: a flag says "overwrite whatever is there now", so a copy edited between
  the refusal and the confirmation is discarded under permission given for
  different content — and the same flag would have to be trusted from every
  later caller. The receipt names what it was given for.

- **Keep refuse-only, fix the messaging (option 1 in #62).** Distinct, accurate
  messages would still send the user to a terminal to `rm -rf` the copy and
  redeploy by hand — the exact handwork the one-click Update exists to remove. Honest, but it leaves the
  shipped feature unusable.
- **Just proceed silently (no warning) on a not-proven-clean copy.** Simplest,
  but it silently resets a copy that *might* carry a genuine edit. We explicitly
  chose not to destroy without telling the user, even for non-precious content.
- **A modal confirm dialog.** Better-looking, but it builds polished UI ahead of
  the deferred styling pass (ADR-0004) — built once now, rebuilt later.
- **Different behaviour for Deploy vs Update.** The destination
  hazard is identical at both entry points; two policies for one fact is DRY
  debt and a split mental model.
