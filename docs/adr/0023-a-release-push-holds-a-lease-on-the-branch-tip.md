# ADR-0023 — A release push holds a lease on the branch tip

- **Status:** Accepted
- **Date:** 2026-08-05 (issue #520, review round 2)

## Context

Publishing a release is two remote calls: one read for the default branch's
tip, then one push that tags exactly that commit (#520). Between them the
branch can move, and the tag would then name a commit the branch has already
left behind — a real commit, but not the release the author confirmed.

Git offers no compare-and-swap for creating a tag. The nearest thing is
`--force-with-lease` on a *branch*, which git only checks when it sends that
branch's ref.

## Decision

**The push carries the branch as a lease, and `--atomic` binds the tag to it.**

```
git push --atomic --force-with-lease=refs/heads/<branch>:<commit> origin \
  <commit>:refs/tags/<name> <commit>:refs/heads/<branch>
```

1. The branch refspec re-pushes the commit the branch is expected to still be
   at. It is a lease, never an update.
2. `--atomic` means a stale lease refuses the tag with it: nothing is created.
   The adapter reads that refusal as `stale-tip`, which the use case reports as
   `plan-changed` — read again, decide again.
3. Measured on git 2.50: while the lease holds, git sends only the tag ref, so
   no branch write is attempted and branch protection is never consulted. A
   publish therefore needs no push rights on the default branch.

## What this does not promise

The window narrows; it does not close. Git evaluates the lease against the ref
advertisement it received at the start of *this* push, so a tip that moves
between that advertisement and the remote applying the refs is still tagged.
That window is one round-trip wide, against seconds for the read-then-push it
replaces.

Closing it entirely needs a compare-and-swap git does not have — the GitHub
Refs API, which would make Maestro's tag path GitHub-specific and no longer one
git command. Rejected: the residual window is narrower than the one a human
running `git tag && git push` lives with, and the outcome of losing it is a tag
one commit behind, never a lost or overwritten release.

`--atomic` is a protocol capability. A remote that does not advertise it fails
the push rather than tagging without the lease, which is the fail-closed side.
