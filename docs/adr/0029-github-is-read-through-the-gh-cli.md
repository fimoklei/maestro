# ADR-0029 — GitHub is read through `gh`, as a capability that degrades

- **Status:** Accepted
- **Date:** 2026-09-08 (placement decided in issue #826; measured in issue #806;
  recorded for the author-journey
  spec #827)

## Context

The Harness journey needs facts git refs cannot carry. A tree hash proves what
a skill's content is; it cannot say whether a pull request exists, whether it
is open, closed unmerged or merged, whether it is a draft, what the review
decision is, who was asked to review, or what its durable URL is. Today a
pushed branch with no pull request is presented as an open review, and the link
to the real request is rebuilt rather than read.

Those facts live in GitHub. Reaching them means either an HTTP client holding a
token of Maestro's own, or the author's `gh` CLI with the authentication they
already have. Measured against `gh` 2.86.0 (#806), one `gh pr list` call answers
the whole screen in under half a second, returns `[]` and exit 0 when a branch
has no request, and separates *no answer possible* (missing binary, not signed
in, offline) from *an answer that is "no"*.

## Decision

**Maestro reads GitHub only through the `gh` CLI, as an optional capability
that degrades instead of blocking.**

1. **`gh` is a third executable, and the first not required to use Maestro.**
   Absent, unauthenticated, unreachable, timed out or malformed `gh` degrades
   the review capability alone: the affected stage reads **Review status
   unavailable** or **Review status unknown**, and every independently verified
   git and release fact stays readable and actionable.
2. **One batched read per Harness**, behind `HarnessReviewPort` with
   `GhCliAdapter` in `core` (ADR-0002). Never one query per skill.
3. **github.com only.** `gh` sends an unknown host's query onward as if it were
   GitHub Enterprise, so the host gate of ADR-0014 runs before any call.
4. **`gh` output crosses only as shape-checked fields** — request identity, URL,
   state, draft flag, review decision, requested reviewers, head and base
   branch — validated with Zod where the output is first read. A branch name
   must be one `git check-ref-format` accepts (issue #1075). No raw output
   reaches a response, a notice or a log. This is ADR-0018's carve-out, applied
   to a second binary.
5. **Maestro holds no credential.** `gh` receives ambient environment only.
   Maestro never stores, reads or forwards a token, and adds no token-bridging
   path. That is what makes preferring `gh` a decision rather than a workaround.
6. **git says what the content is; `gh` says what the team did with it.** The
   tree-hash comparison stays the source of a stage. `gh` adds the request's
   existence, state, verdict and link.
7. **Never infer a cause the signal does not support.** GitHub returns the same
   answer for an absent repository and a private one, so a failed read is
   reported as a failed read. A bounded or incomplete answer never proves
   absence.

## Consequences

- Authors who already use `gh` get review facts with no setup; authors who do
  not keep today's cockpit minus the review column.
- The `gh` driver rule for agents carries the imperatives (`--repo`, `--state all`
  and `--limit` always, `[]` means none, Zod at the adapter, prompts disabled,
  bounded time, never echo output).
- The security rule for agents covers `gh` as the third executable and forbids
  bridging a token to it, beside the same rule for `apm`.
- ADR-0021 gains the stage-membership amendment; the released-only Inventory
  decisions it already carries at points 7–9 are unchanged by this record.
- GitHub Enterprise or any other review host needs a new ADR and its own
  measurement. The host gate refuses them today.

## Rejected alternatives

- **The GitHub API with a token Maestro manages.** It removes the third binary
  and works without `gh` installed — at the cost of Maestro storing, refreshing
  and scoping a credential, which the product has never done and which
  ADR-0001's "drive, never own" posture argues against. Credential storage is
  also out of scope for #827.
- **Git refs alone.** Refs carry the stages already, but `refs/pull/<n>/head` is
  not fetched by default and cannot separate open from closed from merged, name
  the draft flag, or give the durable URL. It answers everything except the part
  that was broken.
- **`gh pr view <branch>`.** Exits 1 with prose when no request exists, turning
  absence into a message to parse. `gh pr list --state all` returns `[]` and
  exit 0.
- **A query per skill.** Turns one screen into N network calls and N failure
  modes, for facts one batched call already returns.
- **Making `gh` a requirement.** A missing optional binary would become a broken
  cockpit for every consumer who never authors a skill.
