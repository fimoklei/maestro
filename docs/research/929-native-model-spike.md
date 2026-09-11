# Spike: a tagged Harness upgrade on the native package model (issue #929)

Date: 2026-09-11. apm 0.29.0, sandbox `HOME` (`realpath`ed), no credentials
in the environment, no rate-limit line in any capture. Builds on
[833-apm-bundle-subset.md](833-apm-bundle-subset.md) (#928), which measured
the same phases against a local-path package; this run repeats them against
a **tagged GitHub repository**, project and global.

Fixture: `github.com/fimoklei/apm-spike-833` (public, throwaway; may be
deleted). Shaped like the Harness: root `apm.yml` with `includes: auto`, six
skills under `.apm/skills/` (`alpha`…`zeta`), no other primitive type.
`v1.0.0` = six skills. `v2.0.0` = `beta` and `gamma` changed, `eta` added,
`epsilon` deleted. Subset under test: `alpha beta gamma delta epsilon`
(`FIVE`); `FOUR` drops `epsilon`. Global runs: `-g -t claude,codex` from a
neutral cwd. Captures: `tests/fixtures/apm-spike-833-*.txt` (provenance in
`tests/fixtures/README.md`); the driving script and full log are in the
session scratchpad (`run929.sh`, `run929.txt`), not committed.

The repository was created private as approved and switched to public before
the first install: a private repository cannot be read without a token, and
the spike ran with none.

## Steps

| # | Step | Result | Capture |
|---|---|---|---|
| 0 | `apm view … versions` | **pass** — lists `v2.0.0`, `v1.0.0` (tags) and `main`. The output opens with the update banner (`A new version of APM is available: 0.30.0`) on **stdout**. | `view-versions` |
| 1 | Install v1 `FIVE`, project and global | **pass** — 5 skills deployed; global writes `.claude/skills/` and `.agents/skills/`; `skill_subset` in both lockfiles; global lock rows for `.agents/…` carry `target: codex` (the subpath captures of #772 carry `target: agents`). | `step1-project`, `step1-global`, `apm.lock.spike-833-v1-global-two-tool.yaml` |
| 2a | Re-install v2 with `FIVE` on the CLI | **pass (fail-closed)** — exit 1, `--skill did not match … Requested: epsilon. Available: alpha, beta, delta, eta, gamma, zeta`, `apm.yml restored`, files and lockfile untouched. Same at `-g`. | `step2-project-cli`, `step2-global-cli` |
| 2b | Re-install v2 by editing `ref:` and running a bare install | **surprising** — exit 0, **four** skills deployed (not zero), `beta`/`gamma` rewritten, `alpha`/`delta` byte-identical, `epsilon` deleted (`Cleaned 2 stale files`), `eta` stayed out. **No warning** that `epsilon` is gone; `apm.yml` and the lockfile's `skill_subset` still list it. At `-g` the same, plus a spurious `2 skills replaced by a different package (last installed wins)` naming `beta` and `gamma` — the two changed skills of the same package (`--verbose` capture). | `step2-project-bare`, `step2-global-bare`, `step2-global-bare-verbose`, `apm.lock.spike-833-v2-project.yaml` |
| 2c | Re-install v2 with `FOUR` on the CLI over a persisted `FIVE` | **surprising** — exit 0: the CLI check covers only the names passed, the union keeps `epsilon` in `apm.yml`, and the result equals 2b. | `step2c-cli-four` |
| 3 | Narrow: drop `delta` from `skills:`, bare install | **pass** — `Cleaned 2 stale files` (4 at `-g`, two tools), `skill_subset` shrinks, `epsilon` still listed in the manifest with no complaint. | `step3-narrow`, `step3-narrow-global` |
| 4 | Local copies already equal to v2, then re-install v2 | **pass, no marker** — exit 0, `4 skill(s) integrated`, no refusal, no `(files unchanged)`; lockfile hashes move to v2. Same by CLI. A same-ref bare re-install over an edited copy silently **resets** it to the pinned content (exit 0, no warning). A same-ref bare re-install of a clean copy prints `5 skill(s) integrated`, never the `No changes -- install state already up to date` no-op marker. | `step4-bare`, `step4c-same-ref`, `same-ref-clean-reinstall` |
| 5 | Fail mid-install (`gamma` dir 555, file 444), ref edit, bare install | **surprising** — exit 1, `Failed to integrate primitives: [Errno 13] Permission denied: 'SKILL.md'`, lockfile byte-identical to before (still v1), `apm.yml` keeps the hand-edited `ref: v2.0.0` — but `beta` on disk is already v2 while its lockfile hash is v1. Retry after `chmod` **converges**: exit 0, four skills at v2, lockfile at v2. | `step5-fail`, `step5-retry` |
| 6 | `apm outdated`, `apm uninstall` | **pass** — `outdated` prints one row `v1.0.0 → v2.0.0 outdated, git tags` (project and `-g`), `All dependencies are up-to-date` at v2. `uninstall <ref>#v2.0.0` removes the whole entry: files (`6` / `12` stale files), manifest entry, `apm_modules/`, and deletes the lockfile. | `step6-outdated-*`, `step6-uninstall-*` |

Unmeasured: a network drop after download (only a filesystem failure was
injected); a rename test (`v3.0.0` was reserved but not needed — #928 F/F2
already measured rename against a local package); whether the update banner
in `view` stdout survives `resolveLatestTagFromVersionsTable`.

## Blockers for the gate

1. **A dropped skill is cleaned silently.** apm never warns that a name in
   `skills:` no longer exists at the new tag (2b, 3). The cockpit must diff
   the subset against the new tag's `.apm/skills/` names *before* the install
   and say which selected skills the tag no longer has.
2. **Fail-closed only when every name is on the CLI.** The CLI check covers
   the passed names, not the persisted ones (2a vs 2c). Passing the whole
   subset as `--skill` flags on every install is the only loud path; the
   bare-install path must be treated as silent.
3. **The manifest and lockfile keep stale names.** `epsilon` stays in
   `skills:` and `skill_subset` after it is gone (2b, 3). The deploy-state
   reader must derive "what is deployed" from `deployed_files` grouped by
   `skills/<name>/`, never from `skill_subset`.
4. **No atomicity, no no-op marker.** A failed install leaves files at the
   new content with a lockfile at the old (5); re-installing an unchanged
   package prints `N skill(s) integrated`, never the no-op marker (4). The
   driver's success classification holds (`Installed 1 APM dependency`), but
   Maestro cannot tell "nothing changed" from "rewritten" by output; it must
   compare hashes itself. The retry does converge, so "fix and deploy again"
   is a valid recovery notice.
5. **Edited copies are reset, not refused, on a same-ref re-install** (4c).
   ADR-0027's guard in front of every install stays mandatory for the native
   model; apm offers no protection of its own.
6. **`target:` is not stable across shapes.** Root-package global rows carry
   `target: codex` where the subpath captures carry `target: agents` (1). The
   reader must accept both (or key on the path root), and
   `package_type: apm_package` must be admitted next to `claude_skill`.
7. **The `-g` two-tool run prints a false ownership warning** (`2 skills
   replaced by a different package`) for the package's own changed skills
   (2b). Never surface it, never parse it; it is not a conflict.
8. **The update banner lands on stdout** (0). Any parser of `apm view`
   output must skip leading non-table lines.
