# What APM supports for a different Selection per user-level folder (issue #1550)

Date: 2026-10-15. apm **0.32.0**, the version Maestro pins
(`scripts/bootstrap.mjs:8`). **Source reading only: no install was run.**
Source: the 0.32.0 wheel under `~/.cache/uv/archive-v0/35E4EeruXmytYE2Z/apm_cli/`
(paths below are relative to `apm_cli/`). Docs and changelog: `microsoft/apm`
at tag `v0.32.0`. Builds on `docs/apm-behavior.md` (0.32.0),
[929-native-model-spike.md](929-native-model-spike.md) and
[941-narrowing-spike.md](941-narrowing-spike.md). "(source)" marks a claim read
from code; "(measured)" marks one an earlier spike captured.

## Answer

**No, as asked.** APM cannot give `~/.claude/skills` the skills `a, b` and
`~/.agents/skills` only `a` from the one Harness root-package dependency.
**Partly, for a weaker need:** a per-dependency `targets:` field limits the
**whole** dependency, with its whole `skills:` list, to a set of targets. That
supports "the Harness lands in these folders". It does not support "this skill
lands in this folder".

## The manifest

- **Per-dependency `targets:` exists (source, docs).** A git object entry
  accepts `alias, allow_insecure, git, path, ref, skills, targets, type` and
  nothing else (`models/dependency/object_fields.py:13-24`, `:62-71`).
  `targets:` is parsed at `object_fields.py:82-84` →
  `models/dependency/subsets.py:59-88`. It takes target slugs, sorted and
  lowercased. An unknown slug is a parse error, and so is `targets: []`. Shipped
  in 0.22.0 for hooks (CHANGELOG `[0.22.0]`, #1902). The manifest schema says
  "Effective reach = install targets INTERSECT this list"
  (`docs/.../reference/manifest-schema.md` §4.1.2, field table and the paragraph
  after it).
- **There is no `skills:` per target.** `skills:` is one flat list per entry
  (`subsets.py:36-56`), and the closed field set above leaves no room for a
  map.
- **One repository gives one entry.** `get_unique_key` is the repo URL plus
  host, source and `virtual_path`. It ignores `skills`, `targets` and `alias`
  (`models/dependency/reference.py:350-371`). Two root entries for the same
  Harness collapse:
  - Same ref: the second is skipped as an existing node
    (`deps/apm_resolver.py:684-700`, `:762-774`).
  - Different refs: the first one wins (`apm_resolver.py:48-59`, `:807-812`).
- **The filter reaches skills (source).** `install/phases/integrate.py:674` →
  `install/template.py:428` passes `dep_ref.target_subset` →
  `install/services.py:294-304`. There `resolve_effective_package_targets`
  (`install/target_filter.py:72-150`) narrows `targets`, and the skill
  integrator gets the narrowed list (`services.py:602-609`). If the entry's
  targets do not overlap the active ones, the dependency is skipped with a
  warning (`target_filter.py:61-68`, `services.py:321-323`).
- **No CLI flag writes it.** `-t/--target` sets the install's active targets
  (`commands/install.py:916-931`). `set_target_subset_for_entry`
  (`commands/_apm_yml_writer.py:28-40`) has no caller in `apm_cli/`. Maestro
  would have to write `targets:` into `apm.yml` itself, as it writes `skills:`
  today.
- **Maestro's own install path would erase it (source, unmeasured).** A CLI-ref
  install rebuilds the entry from the CLI string:
  - The parsed ref has `target_subset = None` (`reference.py:105`).
  - `install.py:440-442` always seeds `_apm_yml_entries[canonical]` from it.
  - Then `install.py:482-491` → `install/package_resolution.py:345-378` →
    `merge_structured_entry_into_current_deps` replaces the whole dict
    (`package_resolution.py:444`).
  - `to_apm_yml_entry` writes `skills` but no `targets`
    (`reference.py:1970-1980`), and nothing in `package_resolution.py` carries
    the old `target_subset` over.

  ADR-0031's Selection write path (write `skills:`, then install the root ref
  with `--skill`)
  would therefore drop a hand-written `targets:` on every Deploy.
- **The lockfile echoes it.** Each entry records `target_subset`, marked
  "Audit-only" (`deps/lockfile.py:241`, written at `:414-415`). Only the audit
  drift replay reads it (`install/drift.py:708`; CHANGELOG #1930).

## `-g -t claude --skill a`, then `-g -t codex --skill b`

All source, unmeasured as a sequence.

1. **First install.** It creates `~/.apm/apm.yml` with a top-level
   `targets: [claude]`, written only when apm creates the manifest
   (`install.py:1478-1491`). The Harness entry gets `skills: [a]`.
2. **Second install, manifest.** Same identity, so it updates the same entry.
   `--skill b` is unioned with the stored list, giving `skills: [a, b]`
   (`package_resolution.py:213-238`, `:284-311`). The top-level
   `targets: [claude]` stays, and no per-dependency `targets:` is written.
3. **Second install, disk.** It deploys the union `a, b`
   (`package_resolution.py:241-267`) to the active target `codex`, so
   `~/.agents/skills/a` and `~/.agents/skills/b` are written.
4. **No prune of the first target.** `.claude/skills/a` counts as stale for the
   package (`install/phases/cleanup.py:157`). But the cleanup validates paths
   only against the **active** targets (`cleanup.py:188`;
   `integration/base_integrator.py:506-551`), so a `.claude/` path is refused
   (`integration/cleanup.py:390-398`). It is counted as `skipped_unmanaged`,
   which goes into `retained` (`cleanup.py:61-79`), and is added back to
   `deployed_files` (`phases/cleanup.py:195-197`). The deployment ledger keeps
   the `claude` rows too: `claude` is declared and not active, so
   `_is_stale` is false (`core/deployment_state.py:404-415`). The declared set
   comes from `apm.yml` alone (apm-behavior § Global scope, source-grade). This
   matches the measured "Ghost entries survive a narrowing `-t`" (apm-behavior
   § Global scope, 0.29.0).
5. **Result.** `~/.claude/skills` holds `a`, and `~/.agents/skills` holds
   `a, b`. That is the reverse of what the ticket wants, and it is leftover
   state, not recorded intent. One lockfile entry lists `skill_subset: [a, b]`
   and `deployed_files` for `.claude/skills/a` plus `.agents/skills/{a,b}`. The
   next install that names both tools (Maestro always passes
   `-t claude,codex`) deploys the union to both folders.
6. **`deployments[].target` for the `.agents` rows.** Two values have been
   measured: `codex` on root-package global rows (929, step 1) and `agents` on
   subpath rows (apm-behavior § Lockfile). Neither is a folder name you can
   rely on. Not re-read from source here
   (`target_name_for_locator`, `services.py:624-636`).

## A per-dependency `targets:` change (source, unmeasured)

- **Narrowing while the dropped target is still active.** For example,
  `[claude, codex]` → `[claude]` under `-t claude,codex`. The dropped `.agents`
  files are stale, and `.agents` is still an allowed prefix, so they are
  deleted, hash-gated (`phases/cleanup.py:144-209`). This is the
  per-dependency counterpart of narrowing `skills:` (941, step 2).
- **Entry targets that miss every active target.** The dependency is skipped
  and returns no files (`services.py:321-323`). What then happens to its
  earlier files is not settled by reading.

## `outdated` and `uninstall`

- **`outdated`: one row per dependency, no target dimension.** The word
  `target` appears 0 times in `commands/outdated.py` (768 lines) and 0 times in
  `deps/outdated_row.py`. A root package gets one row (apm-behavior § Drift,
  measured on 0.32.0). One dependency follows one ref, so every folder follows
  the same release.
- **`uninstall`: whole package, every folder.** There is no `-t`
  (`commands/uninstall/cli.py:221-228`; apm-behavior § Remove). It removes
  every file the entry owns, whatever `targets:` says (apm-behavior § "Narrowed
  `targets:` no longer scopes anything", measured on 0.29.0). Per-dependency
  `targets:` only scopes how the remaining packages are re-integrated
  (`commands/uninstall/engine.py:1178-1191`).

## Constraints for the map (#1549)

1. **A folder is not a slug.** `targets:` takes target slugs. At user scope six
   of them share `~/.agents/skills` (`copilot`, `cursor`, `gemini`, `codex`,
   `windsurf`, `agent-skills`; apm-behavior § Lockfile). To choose a folder,
   name one slug that writes it, and make sure `-t` includes that slug,
   because the reach is the intersection.
2. **Per-skill folder choice needs one entry per skill.** Only a different
   unique key gives a second entry: a subpath (`virtual_path`) ref per skill,
   each with its own `targets:`. This reverses ADR-0031 and the apm-driver rule
   "A Selection is never a set of per-skill subpath refs". Not checked: whether
   a root entry and a subpath entry of the same skill can coexist; the
   cross-package protection (#1831, `phases/cleanup.py:161-173`) is the code
   that would govern it.
3. **A whole-Harness folder choice fits the root model**, but only if
   `targets:` survives the install. Per the source it does not survive a
   CLI-ref install (above), and the bare-install path is the silent one (929,
   blocker 2).

## Spikes that would settle it

Run each with a `realpath`ed sandbox `HOME` and the fixture Harness
(`pnpm smoke:ready --scenario`, LEARNINGS `apm-driver/spike-isolation`,
`insteadof-needs-an-existing-github-name`).

- **S1, the ticket's sequence.** `-g -t claude --skill a`, then
  `-g -t codex --skill b`. Capture `apm.yml`, the lockfile and both folders
  after each step.
- **S2, does `targets:` survive.** Hand-write `targets: [claude]` on the root
  entry. Run `apm install <ref> --skill … -g -t claude,codex`: is `targets:`
  still in `apm.yml`, and did `~/.agents/skills` stay empty? Repeat with a bare
  `apm install -g -t claude,codex`.
- **S3, narrowing per-dependency `targets:`.** `[claude, codex]` → `[claude]`
  under `-t claude,codex`. Check whether the `.agents` copies and their lockfile
  rows go, and whether an edited `.agents` copy is kept and warned, as in 941
  step 3.
