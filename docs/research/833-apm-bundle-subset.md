# APM 0.29.0 with a bundle dependency and a skill subset

Date: 2026-09-11. Research only, for #928 (parent #833). Extends
[harness-release-adoption-apm.md](harness-release-adoption-apm.md).

Each fact is graded **measured** (sandbox command, output captured),
**source** (installed apm source, `file:line`), or **assumed** (neither).
`apm --version` is 0.29.0. Source root: `~/.local/share/uv/tools/apm-cli/lib/python3.11/site-packages/apm_cli/`.
Docs: [install reference](https://microsoft.github.io/apm/reference/cli/install/),
[manifest schema](https://microsoft.github.io/apm/reference/manifest-schema/).

## Method and its limit

Sandbox: `HOME` = realpathed `mktemp -d`; a local git repo shaped like the
real Harness — `apm.yml` with `includes: auto`, `.apm/skills/{alpha…zeta}`,
one `.apm/instructions/*.instructions.md`, one `.apm/agents/*.agent.md`; no
root `skills/`. Installed by **local path**, never by network. Scripts and
full captures: `/private/tmp/apm928.jCCj/out/` (`run1.sh`, `run2.sh`,
`run1.txt`, `run2.txt`); the `-g` capture is in the issue #928 resolution
comment.

Limit: a local-path entry is `source: local` and carries no
`resolved_ref`/`resolved_commit`/`content_hash`; `apm outdated` skips it
(`commands/outdated.py:508`). Tag movement was therefore simulated by
changing the package working tree, and the git-only fields are source-read.
Selection, cleanup, transaction and uninstall run through the same phases
for git and local sources (`install/sources.py`, `install/phases/*`).

## Package type

The Harness is an `APM_PACKAGE`, not a `SKILL_BUNDLE`: the detection cascade
returns `SKILL_BUNDLE` only for a root `skills/<name>/SKILL.md`, and
`APM_PACKAGE` for `apm.yml` + `.apm/` (source,
`models/format_detection.py:452-459`). Measured: the lockfile entry reads
`package_type: apm_package`. Skills are then promoted from `.apm/skills/`
through `_promote_sub_skills_standalone` with the subset applied
(`integration/skill_integrator.py:913,1457`). `--skill` validation resolves
through the same `skill_source_paths`, which falls back to `.apm/skills/`
when no root `skills/` exists (`skill_integrator.py:564-610`), so the
`SKILL_BUNDLE` help text applies to the Harness shape too.

## Facts

### Selection

| Fact | Provenance | Status |
|---|---|---|
| Repeated `--skill` in one call and across calls is a union with the persisted `skills:` list. `--skill gamma` over `[alpha, beta]` yields `[alpha, beta, gamma]` in `apm.yml`, `skill_subset` and on disk. | run2 step B; `install/package_resolution.py:213-238,241-267` | measured |
| `--skill '*'` resets: `apm.yml` entry collapses to the plain path string, `skill_subset` leaves the lockfile, all six skills deploy. | run2 step E; `package_resolution.py:312-320` | measured |
| Narrowing is only by editing `skills:` in `apm.yml` and running a bare `apm install`. No CLI flag drops one skill. | `commands/install.py:1028` help text; docs install page | source + docs |
| A dropped skill's files are deleted on the next bare install: `Cleaned 2 stale files` (dir + `SKILL.md`), exit 0, lockfile subset shrinks. | run2 step C; `install/phases/cleanup.py` block B, `drift.py:detect_stale_files` | measured |
| A dropped skill whose copy was edited is **kept** with two warnings (`Skipped removing … edited since APM deployed it`), exit 0; the lockfile drops it anyway, so the file becomes unowned. | run2 step C2; `integration/cleanup.py:457` | measured |
| A `--skill` name absent from the package is an install error, exit 1, `apm.yml restored to its previous state`, nothing deployed. Message lists the available names. | run2 step D; `install/outcome.py:31-57`, `install/template.py:307-323` | measured |
| The same check applies to a *persisted* `skills:` name only as a **warning**: a manifest subset that matches nothing prints `Skill selection matched no available skills`, exit 0, and deploys zero skills — every previously deployed skill is cleaned. | run1 step C (a malformed edit produced name `alpha - gamma`); `skill_integrator.py:633-653` | measured |
| The lockfile-phase union only touches `package_type == "skill_bundle"` entries; for `apm_package` the subset reaches the lockfile from the manifest via `LockedDependency.from_dependency_ref` — and the measured lockfile does carry it. | `install/phases/lockfile.py:338-363`; `deps/lockfile.py:645` | source + measured |

### Moving the tag (simulated by a package content change)

| Fact | Provenance | Status |
|---|---|---|
| Bare install with `skills: [alpha, delta]` after `delta` was renamed to `delta2`: exit 0, `alpha` updated, `delta` cleaned (`2 stale files`), **no warning** about the missing name; `apm.yml` and `skill_subset` still list `delta`. | run2 step F | measured |
| CLI re-install `--skill alpha --skill delta` against the same package: error `--skill did not match skills … Requested: delta. Available: … delta2 …`, exit 1, nothing changed. | run2 step F2 | measured |
| Subset persists unchanged across a re-install; apm never rewrites it except through `--skill` union/reset. | run2 steps C, F; `package_resolution.py:284-320` | measured + source |
| With a git ref, the same install rewrites `resolved_ref`/`resolved_commit`; no subset-specific code runs on the ref path. | `docs/apm-behavior.md` § Update; grep `skill_subset` shows no ref handling | source |

### `includes: auto` and non-skill primitives

| Fact | Provenance | Status |
|---|---|---|
| A root install deploys every primitive the targets accept: `*.prompt.md`, `.apm/prompts`, `*.agent.md`, `.apm/agents/*.md`, `.apm/instructions/*.instructions.md`, hooks (when approved), canvas bundles, skills, `bin/` for plugins. Measured: `.claude/agents/helper.md` and `.claude/rules/extra.md` land beside the two selected skills. | run2 step A lockfile; `install/deployable_source_plan.py:116-235` | measured + source |
| Only skills are scoped by the subset. Nothing scopes agents or instructions except the per-dependency `targets:` list (which scopes by tool, not by primitive). | `deployable_source_plan.py:174`; manifest schema § 4.1.2 | source + docs |
| `includes: auto` is the *producer's* publish consent ("all local content from the selected source layout"); the consumer has no include filter. | manifest schema § 3.9; `models/apm_package.py:527-540` | docs + source |
| Non-skill primitives survive subset changes and a match-nothing subset (`1 agents adopted`, `1 rule(s) adopted`). | run1 step C, run2 steps C–F | measured |

### Global (`-g`)

| Fact | Provenance | Status |
|---|---|---|
| `~/.apm/apm.yml` holds the same `path:` + `skills:` object entry; `~/.apm/apm.lock.yaml` the same `skill_subset`; union on a second `--skill` behaves identically. | `-g` run capture | measured |
| Deploys to `~/.claude/{agents,rules,skills}` with `scope: project` in the lockfile, as already recorded. | `-g` run capture; `docs/apm-behavior.md` § Global | measured |
| The global manifest's own self-entry is also installed (`[+] <project root> (local) (files unchanged)`). | `-g` run capture; `drift.py:232-239` (`_SELF_KEY`) | measured |

### Lockfile shape of the root entry

```yaml
- repo_url: _local/pkg            # git: owner/repo
  name: harness-fixture           # from the package apm.yml
  version: 1.0.0
  package_type: apm_package
  deployed_files:                 # dirs and files, all primitives mixed
  - .claude/agents/helper.md
  - .claude/rules/extra.md
  - .claude/skills/alpha
  - .claude/skills/alpha/SKILL.md
  deployed_file_hashes:           # per file, sha256 of content
    .claude/skills/alpha/SKILL.md: sha256:…
  source: local                   # git: resolved_ref, resolved_commit, content_hash instead
  skill_subset: [alpha, beta]     # absent after --skill '*'
```

Attribution: a file belongs to a skill by its path prefix
`<root>/skills/<name>/`; there is no per-skill hash block. Tool comes from
`deployments[].target` (deploy root, `claude` / `agents`) as before. One
entry per package, not per skill, so `DeployStateReader`'s
`package_type === "claude_skill"` filter would hide the whole Harness
(measured shape; reader per `docs/apm-behavior.md` § Lockfile).

### `apm outdated` and `apm uninstall`

| Fact | Provenance | Status |
|---|---|---|
| `outdated` prints one row per lockfile entry (`Package / Current / Latest / Status / Source`); it compares `resolved_commit` to the latest tag and knows nothing of the subset. Local deps are skipped: `No remote dependencies to check`. | `commands/outdated.py:566-590,505-517`; sandbox capture | source + measured |
| `uninstall` takes `PACKAGES…`, `--dry-run`, `-v`, `-g` — no `--skill`. It removes the whole package: all deployed files (`Cleaned 4 stale files`), the `apm.yml` entry, `apm_modules/` subtree, and deletes the lockfile when it was the last entry. Same at `-g`. | `commands/uninstall/cli.py:48-58`; run2 step G2; `-g` capture | measured + source |

### Transaction scope

| Fact | Provenance | Status |
|---|---|---|
| `InstallTransaction` journals two things: a byte snapshot of `apm.yml`, and paths prepared under `apm_modules/` (`ResolutionStagingSession`). "Native target integrations are outside this transaction." | `install/transaction.py:73-76,87-99`; `install/resolution_staging.py:13-77` | source |
| Rollback restores/deletes `apm.yml`, removes session-created `apm_modules` paths and restores replaced ones. Deployed files under `.claude/` are not touched. | `transaction.py:156-164`; `resolution_staging.py:76` | source |
| Measured mid-install failure (`.claude/skills` read-only): `apm.yml restored to its previous state`, no lockfile written, `apm_modules/` empty, exit 1 — but `.claude/agents/helper.md` and `.claude/rules/extra.md` were already written and stay on disk, owned by nothing. | run2 step I | measured |
| Result: a failed install can leave unowned primitive files; the next successful install adopts them (`adopted` lines). | run2 step I then any later install | measured |

## Where source and docs disagree

- The install page says an unmatched `--skill` name "is an install error" —
  true for the CLI, but a persisted `skills:` name that no longer exists is
  a warning with exit 0 (or silent, when other names still match). The page
  does not mention the silent case.
- The install page says edited files "are kept with a warning" — measured
  true, but it does not say the lockfile still drops them, leaving an
  unowned copy.
- The `--skill` help text and the code speak of `SKILL_BUNDLE`; the Harness
  shape (`.apm/skills/`) is an `APM_PACKAGE` and takes the sub-skill path,
  with identical subset behaviour. Not documented on either page.

## Consequences for the spike ticket (not decisions)

- Adoption of a new tag with a fixed subset is one command:
  `apm install github.com/<o>/<r>#vX -t <tools>` with `skills:` already in
  `apm.yml`. A skill renamed or removed upstream is then cleaned silently.
  Maestro must compare the subset with the new tag's `.apm/skills/` names
  itself and warn before the install.
- To catch the rename loudly instead, pass the full subset again as
  `--skill` flags: the CLI check fails closed with the available names.
- Every install must be preceded by Maestro's own edited-copy check across
  all selected skills (unchanged from ADR-0027's guard): apm keeps an
  edited copy of a dropped skill but disowns it.
- "All files switch together or nothing" is not on offer: primitives are
  written in place before the transaction result is known. A spike must
  measure what a git-source failure (network drop after download) leaves.
- The deploy-state reader needs an `apm_package` entry model that splits
  `deployed_files` by `skills/<name>/` prefix.

Commands for the spike, in order: the sandbox script `run2.sh` (steps
A–I) against a tagged GitHub fixture instead of a local path, plus
`apm outdated` after the fixture gains a tag.
