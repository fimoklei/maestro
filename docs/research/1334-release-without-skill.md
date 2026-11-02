# A target adopts a release without one of its skills (issue #1334)

Date: 2026-10-03. apm 0.32.0 (`apm --version`). Part of the map #1333
(delete a released skill from the Harness). Builds on
[929-native-model-spike.md](929-native-model-spike.md) (a tagged upgrade that
drops a skill, apm 0.29.0) and [941-narrowing-spike.md](941-narrowing-spike.md)
(a kept edited copy on a same-tag narrow).

## Answer

Only **Update target** moves a target to a newer release; Deploy adds a skill
at the release the target already follows
(`packages/core/src/deploy/deploy-skill.ts:355-372`). A target that never
updates keeps its copy, unchanged, at its old release.

On Update, Maestro drops the skill on purpose and apm removes the copy:

- **Clean copy (project and global): removed, as previewed.** The preview lists
  it under **Removed by this release** (`update-target.ts:458`,
  `update-target-copy.ts:32`). Maestro writes `skills:` without it, installs
  the new tag with the same names as `--skill`
  (`update-target.ts:409`, `apply-selection.ts:121`); apm deletes both tool
  copies, the lockfile drops their rows, the outcome row reads **Removed**.
  No refusal and no orphan.
- **Copy with Local edits: broken.** The preview offers **Discard local
  edits** for it, but apm keeps the edited file, so the copy is never
  discarded and the Update never finishes (details below).

## Measurement

Fixture: the smoke Harness `tests/fixtures/fixture-harness`, built with
`scripts/fixture-harness.mjs` into a local bare repository, reached through an
`insteadOf` redirect of `github.com/fimoklei/maestro-fixture-harness` in the
`GIT_CONFIG_KEY_*` channel. `v1.1.0` holds `code-review commit-message
release-notes`; `v2.0.0` changes `code-review`, adds `test-plan` and **drops
`release-notes`**. Every run used a fresh, `realpath`ed throwaway `HOME`;
global runs were `-g -t claude,codex` from a neutral cwd, project runs
`-t claude,codex` (the driver's flags, `apm-cli-driver.ts:205-237`). The
Maestro write was reproduced by hand: replace the `skills:` list, then
`apm install <ref>#v2.0.0 --skill code-review --skill commit-message`.
Script and full logs stay in the session scratchpad (`run.sh`, `proj*.txt`,
`glob*.txt`, `ctl.txt`), not committed.

| # | Step (start: `v1.1.0`, three skills) | Result |
|---|---|---|
| 1 | Maestro path, clean copies, project | exit 0, `2 skill(s) integrated`, `Cleaned 4 stale files`. `release-notes` gone from `.claude/` and `.agents/`, from `deployed_files` and `skill_subset`; `ref: v2.0.0`, `skills:` two. |
| 2 | Same, global | Same disk, lockfile and manifest result. apm also prints the spurious `1 skill replaced by a different package` warning already known from #929 (blocker 7). |
| 3 | Maestro path, `.claude/skills/release-notes/SKILL.md` edited, project | exit 0 with the success marker. `.agents` copy deleted; `.claude` copy **kept** (`Kept user-edited file …`, two `Skipped removing …` warnings). The lockfile still lists the kept file in `deployed_files` with its old hash, at `resolved_ref: v2.0.0`. |
| 4 | Repeat step 3's write (what **Retry update** runs) | Identical: kept again, warned again, lockfile unchanged. It never converges. |
| 5 | Steps 3 and 4, global | Identical to project. |
| 6 | Control, not Maestro's path: `skills:` still three, all three as `--skill` | exit 1, `--skill did not match … Requested: release-notes`, `apm.yml restored`, nothing changed. Same as #929 step 2a. |
| 7 | Control: `skills:` still three, two names as `--skill` | exit 0, `release-notes` deleted silently; `skills:` and `skill_subset` still name it. Same as #929 step 2c. |

Steps 6 and 7 show why Maestro writes `skills:` first: without it apm either
refuses the release or drops the skill with no word and stale names. Maestro's
own path avoids both.

## What the screens show

- **Before Update.** Deploy-state counts the dropped name as a change in the
  release head (`release-head.ts:86`); the Update preview splits it out as
  **Removed by this release** and the counting sentence says `removes 1`.
  The per-skill mark *This deployed skill is absent from the latest release*
  (`read-drift.ts`, `no-longer-released`) reads only legacy per-skill pins
  (`read-drift.ts:169`), so a root-package target never gets it.
- **Inventory** reads the latest release only
  (`inventory/released-skills.ts`): the skill has no row there as soon as the
  release without it is tagged, while targets that have not updated still
  carry it. Those copies are visible only on Deploy-state.
- **After a clean Update.** The skill is gone from the target's Selected skills
  and the outcome lists it under **Removed**.

## The broken path: a dropped skill with Local edits

Traced from code against the apm result of steps 3 and 4:

1. The preview checks every selected copy, the dropped one included
   (`update-target.ts:431`). The new release has no such skill, so the edited
   copy cannot equal it and classifies `diverged` → **Local edits**
   (`deployed-content.ts`, `equalsRelease`). The operator ticks **Discard
   local edits** (`update-target-copy.ts:61`).
2. apm keeps the edited file and its lockfile rows (step 3).
   `readTargetSelection` reads deployed skills from `deployed_files` plus file
   existence, so the target still carries `release-notes`;
   `matches` fails (`apply-selection.ts:175`), the operation record is not
   cleared (`apply-selection.ts:160`) and the result is **Update incomplete**.
   The outcome row says `Still deployed, though v2.0.0 drops it.`
   (`update-target-copy.ts:112`).
3. The notice offers **Retry update** (`update-target-copy.ts:93`). Retry
   re-checks the same copy (`retry-target-operation.ts:116`), asks for consent
   again, and apm keeps the file again (step 4): **Retry incomplete**, forever.
4. While the record stands, Update, Deploy and Remove on that target all
   refuse with `operation-unfinished` (`update-target.ts:256`,
   `deploy-skill.ts:366`, `remove-deployed-skill.ts:447`). The target is stuck
   until the operator deletes the folder by hand, and no screen says so.
   After a manual delete, the next install drops the rows (#941 step 3c), so
   Retry would then finish.

This is not specific to deleting a skill: any release that drops a selected
skill (a deletion, a rename) hits it on every target holding an edited copy.
Spec #945 (user stories 16 and 36) assumes **Discard local edits** discards;
for a dropped skill it does not.

## Verdict for the map

- **Deletion spec: state the consequence only.** On the normal path the
  after-release behaviour already works and is already worded: each target
  keeps the skill until **Update target**, whose preview lists it under
  **Removed by this release** and which then removes it. Inventory loses the
  row at release time, while targets still carry it.
- **Separate `theme:update` fix:** a dropped skill with Local edits breaks
  Update (false **Discard local edits**, endless **Retry update**, target
  locked). The fix belongs to Update, not to the deletion spec: Maestro has to
  delete the consented copy itself (or refuse up front with a clear way out),
  since apm will not.

Unmeasured: an **Unverified** dropped copy (no recorded hashes); the stuck
state through the cockpit end to end (traced from code, the apm half
measured); apm versions other than 0.32.0.
