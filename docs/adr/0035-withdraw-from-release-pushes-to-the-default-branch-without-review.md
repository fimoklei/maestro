# ADR-0035 — Withdraw from release pushes to the default branch without review

- **Status:** Accepted
- **Date:** 2026-10-30 (spec #1727, ticket #1729)
- **Supersedes:** #1642 stories 8 ("no change reaches the default branch
  unreviewed") and 11 ("nothing committed or pushed by the withdrawal itself")

## Context

#1642 built **Withdraw from release** as a local write: the Working Harness got
the latest release's copy, and the author then proposed that change. On
`fimoklei/harness` the item stayed under **Pending release** and **Create a
release** still published it. Taking a merged change back cost a second review
of a change that was never released.

## Decision

**The withdrawal pushes one commit to the default branch, with no pull
request.** The commit makes only the withdrawn names equal to the latest
release. The Working Harness is never written, so the author's copy then reads
as *Not yet proposed*.

1. One port method, `withdrawOnDefaultBranch`, owns the whole git side: it
   refuses a clone whose `HEAD` is not the tip the confirmation read, builds
   the commit in a throwaway index, pushes with a lease on that tip (the
   pattern of ADR-0023), settles an unclear answer by asking the remote, and
   then moves the local branch and resets only the withdrawn paths in the
   index. The working tree is never touched.
2. A refused push never falls back to a pull request.
3. The commit names the merged pull request when the review read knows it.

## Consequences

- A merged change was reviewed once; taking it back before release needs no
  second review. The latest release stays the only quality promise (ADR-0021).
- Anyone who can push to the default branch can withdraw; GitHub decides who
  may push. A protected default branch refuses the press.
- A fast-forward catch-up after the push was rejected: it deletes the author's
  copy of an added item, which is unmodified against the old `HEAD`.
