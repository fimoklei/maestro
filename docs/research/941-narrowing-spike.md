# Spike: narrowing a Selection by writing `skills:` in `apm.yml` (issue #941)

Date: 2026-09-11. apm 0.29.0, sandbox `HOME` (`realpath`ed), no credentials
in the environment, no rate-limit line in any capture. Measures the Remove
shape ADR-0031 settled after #942: Maestro writes the exact Selection to
`skills:` under the Harness dependency, then runs one `apm install
<ref>#<tag>` with the same list as `--skill`. Builds on
[929-native-model-spike.md](929-native-model-spike.md) (the tagged upgrade)
and [833-apm-bundle-subset.md](833-apm-bundle-subset.md) (the source read).

Fixture: `github.com/fimoklei/apm-spike-833` (public, throwaway). `v2.0.0` =
`alpha beta delta eta gamma zeta`; `v3.0.0` (pushed for step 5) re-adds
`epsilon`, a name `v2.0.0` had dropped. Selection under test at `v2.0.0`:
`alpha beta gamma delta zeta` (five); Remove drops `delta` (four). Global
runs: `-g -t claude,codex` from a neutral cwd. Captures:
`tests/fixtures/apm-spike-941-*.txt`, lockfiles `apm.lock.spike-941-*.yaml`,
manifests `apm.yml.spike-941-*.yaml` (provenance in `tests/fixtures/README.md`).

The writer under test is a prototype of Maestro's, not APM's: `yaml`
(already a `core` dependency) `parseDocument` → find the one `dependencies.apm`
item whose `git:` is the Harness → `set("skills", list)` → `toString()`. A
list item is either a map (`git:`/`ref:`/`skills:`) or a bare string (a
local path, see step 6), so the finder must accept both.

## Steps

| # | Step | Result | Capture |
|---|---|---|---|
| 1 | Install `v2.0.0` five, project and global | **pass** — `skills:` persisted as a list under the `git:` entry; apm writes its own `#` comment lines into `apm.yml` (targets block). | `step1-project`, `step1-global` |
| 2 | Write `skills:` to four, install with four `--skill` | **pass** — exit 0, `4 skill(s) integrated`, `Cleaned 4 stale files` (two tools), success marker present; `delta` gone from both tool roots, from `deployed_files`, from `skill_subset`; `skills:` holds four. Same at `-g`. apm prints `(updated ref in apm.yml)` / `Updated apm.yml dependency entries` on every CLI-ref install. | `step2-narrow-project`, `step2-narrow-global` |
| 3 | As 2, with `.claude/skills/delta/SKILL.md` edited locally | **pass, kept and warned, not disowned** — exit 0 with the success marker; `.agents` copy cleaned, `.claude` copy kept with `Kept user-edited file …` plus two `Skipped removing …` warnings; the lockfile still lists the kept file in `deployed_files`, `deployed_file_hashes` (old hash) and `deployments` with `active_owner` set. `skill_subset` is four. A second identical install repeats the warnings; after a manual delete the next install drops the rows. | `step3-edited-drop-project`, `-global`, `step3b-second-install`, `step3c-after-manual-delete`, `apm.lock.spike-941-step3-kept-edited.yaml` |
| 3d | Kept-edited narrow → delete the copy by hand → restore five → narrow again | **surprising, phantom rows** — the files are cleaned (`Cleaned 4 stale files`, both roots empty of `delta`) but the lockfile keeps `.agents/skills/delta` and `.agents/skills/delta/SKILL.md` in `deployed_files`, `deployed_file_hashes` and `deployments`. A further plain install does not remove them. Reproduced in a fresh project and at `-g`. | `step3d-narrow-again`, `apm.lock.spike-941-step3d-phantom.yaml` |
| 4 | Stop half way: `gamma` dir 555 / file 444, then narrow | **no stop** — exit 0; at the same tag apm does not rewrite an unchanged skill, so a read-only sibling never fails a Remove (it did fail the #929 upgrade, where `gamma` changed). | `step4-fail-project` |
| 4b | Stop half way: parent `.claude/skills` 555, then narrow | **surprising, exit 0** — `Cleaned 3 stale files`, then `Could not remove skill directory .claude/skills/delta: [Errno 13] … Path retained in lockfile; will retry on next 'apm install'`, and still the success marker. On disk: `.agents` clean, `.claude/skills/delta/` an empty dir. Lockfile: `skill_subset` four, `.claude/skills/delta/SKILL.md` rows gone, the `.claude/skills/delta` dir row retained. Retry after `chmod`: exit 0, `Cleaned 1 stale file`, disk converges. Same at `-g`. | `step4b-fail-project`, `step4b-retry-project`, `-global`, `apm.lock.spike-941-step4b-fail.yaml` |
| 5 | Exact list at `v3.0.0` (which re-adds `epsilon`) | **pass** — `skills:` and `--skill` both `alpha beta gamma delta`: `epsilon` stays out, `resolved_ref: v3.0.0`, no `epsilon` in the lockfile. Control: a stale `skills:` still naming `epsilon` (left by a `v1→v2` bare install) deploys `epsilon` at `v3.0.0` — on a bare install **and** when the four names are passed as `--skill`, because `--skill` unions with the persisted list. | `step5-exact-list-v3`, `step5-control-v3-bare`, `step5-control-v3-cli-stale` |
| 6 | `apm.yml` with a `#` comment above the Harness entry, an inline comment on a list item, and a second (local-path) dependency | **pass with one limit** — the writer keeps the comment line above the entry and the second dependency untouched; the inline comment on `gamma` is lost because the list is replaced whole. apm's own rewrite after the CLI install leaves the file byte-identical (comment and second dependency survive). The CLI-ref install processes the Harness entry only (`Installing 1 new package`); a bare install re-integrates both dependencies. | `apm.yml.spike-941-step6-*`, `step6-install-cli`, `step6-install-bare` |

## Reading for ADR-0031 rule 9 (write `skills:` before every install)

No blocker. The rule holds on every step: writing the exact list and passing
it as `--skill` removes exactly the dropped skill, keeps the subset honest and
keeps a reused name out (5). Three facts the spec must carry:

1. **A Remove never fails loudly.** Both stop shapes (3, 4b) exit 0 with the
   success marker and warn on stdout. The driver's marker check reads them as
   success; Maestro must read the outcome from disk and lockfile, as ADR-0031
   already says for Update (hashes before and after).
2. **The lockfile can name files that are not on disk** (3d, 4b). ADR-0031's
   "state from `deployed_files`" needs "and the file exists": a row without a
   file is a phantom, never a deployed skill. This is new: #929 measured the
   reverse (files on disk the lockfile does not know).
3. **The kept copy stays owned** (3). A dropped skill with Local edits is not
   removed and the lockfile still claims it. The #931 guard in front of every
   install already prevents this state; the reader must still cope with it
   (a lockfile file under a name outside `skill_subset`).

Accepted limit 5 of ADR-0031 (comments may not survive) narrows to: comments
on the items of the `skills:` list are lost; every other comment survives
both writers.

Unmeasured: a network drop mid-install (no network step exists in a same-tag
narrow; the package is cached); a manifest whose Harness entry is the bare
string form without `skills:` (the writer prototype would need to promote it
to a map).
