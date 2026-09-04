# ADR-0013 — Reconcile a narrowed global install with a scoped guard and a direct subtree removal

- **Status:** Accepted
- **Date:** 2026-07-20 (decision made in issue #136; recorded here when the
  apm rules file was split by lifecycle)

## Context

ADR-0011 made global deploys target only the detected tools. A machine that
already ran the old always-`claude,codex` global install is left with two
leftovers that apm does not clean, because a narrowing `-t` never prunes —
`apm install -g -t claude` over a two-tool lockfile keeps the `.agents`
(codex) `deployed_file_hashes` and leaves the `.agents/skills/<name>` files
on disk. Verified against the apm 0.26.0 source in issue #191 and re-measured
on 0.29.0 in #774 (narrowing `-g -t claude` still left every `.agents` file
and hash in place; the uninstall cleanup added upstream prunes nothing on
install); the mechanics are in `docs/apm-behavior.md` → "Ghost entries". Both
leftovers are global-path only; per-repo deploys are unaffected.

The consequences without a fix:

1. **A false refusal.** The destination guard, scanning every `DEPLOY_TOOLS`
   subtree, compares the retained `.agents` hashes against a copy that is no
   longer targeted — and reads any gap as `deployed-diverged-from-lock`,
   refusing a legitimate single-tool redeploy.
2. **A dead tree.** The obsolete `.agents/skills/<name>` files are exactly
   the junk ADR-0011 exists to eliminate.

The obvious cleanup command is off the table: `apm uninstall -g` deleted 19
pre-existing skill dirs beyond its lockfile (`LEARNINGS.md` ·
spike-isolation), and a per-tool `apm uninstall -g -t codex` is unspiked.

## Decision

**Scope the destination guard to the deploy's tools, and reconcile the
obsolete copy with a direct, subtree-scoped filesystem removal — never
`apm uninstall -g`.**

- **Guard scoping.** On the global path, `deployTargetSubtrees(name, tools)`
  and `DeployedContentAdapter.classify({ …, tools })` filter both the scan
  and the recorded baseline to the detected tools, so an untargeted tool's
  retained hashes never count as this deploy's drift. Absent `tools` (the
  repo path — the only caller that leaves it undefined) still scans every
  tool, unchanged.
- **Cleanup.** After a *successful* global install (the driver verifies
  apm's positive `Installed N APM dependenc` marker; a failed install never
  triggers removal), `DeployedCleanupAdapter.removeSkillTargets` removes
  exactly `<HOME>/<prefix>/skills/<name>` for each untargeted tool
  (`DEPLOY_TOOLS` minus detected). `force: true` makes an already-gone copy
  a no-op, so the machine reconciles idempotently on every global deploy.
  **Narrowed by ADR-0011's #202 amendment:** only untargeted tools that own
  their skills directory outright qualify, so in practice this is the
  `.claude` copy on a machine without Claude Code. `.agents/skills/` has
  other readers and is never removed.
- **Best-effort.** The install already succeeded, so a cleanup error does
  not invert the result to `deploy-failed` — it leaves the pre-existing dead
  tree (no regression), which the next deploy retries.
- **The lockfile is left alone.** apm owns it; the scoped guard makes the
  retained hashes inert for the reader, so hand-editing apm's lockfile is
  unnecessary.
- **Both halves stay, and stay together.** Should a future apm version start
  pruning lockfile entries, the removal becomes *more* necessary, not less:
  pruning without cleanup leaves deployed files on disk with no lockfile
  baseline, which the destination guard reads as divergence — a new false
  refusal. Never remove either half alone.

## Consequences

- A legitimate narrowed redeploy is no longer refused, and every global
  deploy reconciles the dead tree left by the old two-tool install.
- Cleanup runs only on the global path, only after a verified successful
  install — never on repo deploys, never on failure (unit-tested in
  `deploy-skill.test.ts`; the real `rm` under a sandbox HOME in
  `deployed-cleanup.test.ts`; the narrowing scenario in
  `narrowed-global-deploy.test.ts`).
- If a future spike proves a per-tool `apm uninstall` safe, it can replace
  the `rm` behind the same `DeployedCleanupPort` without touching callers.

## Rejected alternatives

- **`apm uninstall -g -t codex`.** Unspiked and, given the recorded
  over-deletion, unsafe to trust; a filesystem removal of the exact known
  subtree is narrower and auditable.
- **Hand-editing apm's lockfile to drop the ghost hashes.** Fragile, fights
  apm's ownership of its own file, and unnecessary once the guard is scoped.
- **Doing nothing.** Leaves a false refusal blocking legitimate redeploys
  and permanent dead trees — the defect ADR-0011 set out to remove.
