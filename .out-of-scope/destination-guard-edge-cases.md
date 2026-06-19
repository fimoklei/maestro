# Destination Guard Edge Cases

The destination guard (`DeployedContentAdapter`) and the Update action carry a
handful of low-likelihood edge cases. They are real as described, but each is
accepted as a documented risk rather than fixed. None is biting in practice, and
for each the likelihood times the impact sits below the threshold that would
justify hardening code that currently works.

This is not a deferral ("we're busy"). For each case the reason is a durable
constraint of how `apm` actually behaves (see `.claude/rules/apm-driver.md`) or a
deliberate design choice — the conditions that would trigger the case do not
arise under Maestro's own usage.

## Why each case is accepted risk

### 1. Legacy unrecorded `.agents` copy → false "diverged"

The guard always scans both `.claude` and `.agents` subtrees, but matches against
a single lockfile entry. A clean, unedited `.agents/skills/<name>` whose lockfile
records only `.claude` keys reads as an untracked extra → false "diverged",
refusing a deploy that touched nothing.

Accepted because Maestro's own driver always deploys `-t claude,codex`, so both
copies are always recorded in the lockfile. The false positive is confined to
legacy or non-Maestro lockfiles, and the deploy refusal has a `force` escape
hatch. The triggering condition does not arise under Maestro's usage.

### 2. Symlinks in the deployed subtree

A symlinked directory is followed and recursed; a file-symlink pointing outside
the subtree is followed and hashed as in-tree content; a symlink standing in for
the skill root surfaces a generic "deploy-failed" (EISDIR/ENOTDIR).

Accepted because `apm` materializes each deploy target as a real copied
directory, not a symlink (verified, recorded in `apm-driver.md`). Symlinks in the
deployed subtree only appear if a user hand-crafts them outside `apm`. Likelihood
is effectively zero.

### 3. Concurrent same-repo updates → scary 409

Each row's Update button owns an independent mutation; `disabled` only guards its
own button. Two updates fired on behind-skills in the same repo both deploy, and
the loser surfaces a "deploy-in-progress" 409 as an alarming error for a benign
collision.

Accepted because the server's in-flight lock correctly prevents the double
deploy — the data is safe. The only defect is the error copy. This is a cosmetic
UX wart, not a correctness problem.

### 4. Stale "behind" during the refetch window

After a successful update the drift query is invalidated but briefly serves stale
"behind" data while refetching, so the Update button can re-render enabled with
no success feedback; a fast second click fires a redundant same-ref deploy.

Accepted because a same-ref deploy on a clean tree is idempotent — `apm` prints
"(files unchanged)" and leaves the pin (recorded in `apm-driver.md`). The worst
case of the redundant click is a no-op. The window is transient.

### 5. Skill name collision in baseline lookup

`readBaseline` matches the lockfile entry by `basename(virtual_path)`,
first-match-wins. Two `claude_skill` entries sharing a leaf name would pick the
wrong baseline (false diverged, or a false clean that lets a real edit be reset).

Accepted because `apm`'s flat layout produces one entry per deployed skill per
target — two entries sharing a leaf name does not occur. The matcher is simply
not defensive against a shape `apm` does not emit.

## If one starts biting

These are recorded so the reasoning is not lost, not because they are forbidden
forever. If a case starts biting in practice — a real legacy lockfile triggers
the false positive, or `apm`'s layout changes — delete this file's relevant
section and open a fresh issue to fix that case.

## Prior requests

- #64 — "Destination guard edge cases (backlog)"
