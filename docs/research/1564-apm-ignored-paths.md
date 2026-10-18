# Where a Harness can keep prompts that apm never delivers

Date: 2026-10-18. Research only, for #1564. Builds on
[1559-apm-prompts.md](1559-apm-prompts.md) (branch
`research/1559-apm-prompts`; where a delivered prompt lands) and
[833-apm-bundle-subset.md](833-apm-bundle-subset.md) (`--skill` scopes skills
only).

Question: which paths in a Harness repo (`includes: auto`) does apm 0.32.0
leave undelivered on every install Maestro runs? Those installs are Deploy
skill, Update target and Remove skill, each a root-package install at a tag
with `skills:` plus `--skill`.

Each fact is graded **measured** (sandbox capture) or **source** (installed
apm source, `file:line` under
`~/.local/share/uv/tools/apm-cli/lib/python3.11/site-packages/apm_cli/`).
`apm --version` is 0.32.0.

## Answer

Any folder that apm does not name is safe. Recommended:
**`.maestro/prompts/<name>.md`**, a plain `.md` file in a dot-folder at the
repo root that Maestro owns. Measured: in 24 installs it reached no tool
folder at project or user scope, with eight explicit targets or with
auto-detect. The plain `.md` extension also keeps it out of the recursive
`**/*.prompt.md` glob that `apm run` uses (§ Discovery rules).

`library/prompts/<name>.md` and `prompts/<name>.md` measured the same and
are fine too. `.maestro/` wins on two counts. apm already reads root
`skills/` and `hooks/` beside their `.apm/` twins, so a root `prompts/`
folder is the likeliest name for a future apm to adopt. And the Maestro
name says who owns the folder.

The answer holds only while the Harness root has no `SKILL.md` (§ The one
precondition).

## Discovery rules (source)

The deploy plan is a closed allowlist. `DeployableSourcePlan.create`
(`install/deployable_source_plan.py:65-234`) lists the files an install may
deliver. `install/services.py:346` builds it once per package, and every
primitive integrator receives it (`services.py:491`, `:615`). Each
integrator drops any file the plan lacks (`integration/base_integrator.py:175-185`).
The plan admits only:

| Primitive | Admitted source paths | Recursive? | Where |
|---|---|---|---|
| prompts / commands | root `*.prompt.md`; `.apm/prompts/**/*.prompt.md` | root no; `.apm/prompts` yes in the plan | `deployable_source_plan.py:116-118` |
| agents | root `*.agent.md`; `.apm/agents/**/*.md` | root no; `.apm/agents` yes | `:120-122` |
| instructions | `.apm/instructions/**/*.instructions.md` | yes | `:124-125` |
| hooks (when approved) | `.apm/hooks/*.json`, `hooks/*.json` | no | `:127-140`; `integration/hook_integrator.py:464-502` |
| canvas (when approved) | `.apm/extensions/<bundle>/` holding `extension.mjs` | bundle tree | `:142-146`; `integration/canvas_integrator.py:108-129` |
| skills | every file of each selected skill under `skills/<name>/` or `.apm/skills/<name>/` | yes, within the skill | `:148-222` |
| skills, root `SKILL.md` | the whole repo tree except `.apm/` | yes | `:154-172` |

The integrators narrow this again. Prompt and command discovery globs
`*.prompt.md` in the repo root and in `.apm/prompts/` without recursion
(`integration/prompt_integrator.py:35`, `command_integrator.py:189-193`,
`base_integrator.py:1031-1059`). So `.apm/prompts/sub/h.prompt.md` passes
the plan and is still never delivered (measured). Nothing else in an
install walks the whole repo for prompts:

- `includes: auto` in the Harness has no effect on delivery. Install reads
  `includes` only for the consumer's own policy check
  (`install/phases/policy_gate.py:96-103`).
- The Harness's `apm.yml` with a `.apm/` folder makes it `APM_PACKAGE`. The
  Claude-plugin layouts (root `commands/`, `agents/`) are never consulted
  (`models/format_detection.py:455-460`).
- The recursive globs (`**/*.prompt.md`, `**/*.agent.md`,
  `**/*.instructions.md`, `**/*.context.md`, `**/*.memory.md`) belong to
  `apm compile`, `apm run` and link resolution
  (`primitives/discovery.py:27-45`, `workflow/discovery.py:21-24`,
  `base_integrator.py:859-873`). None of them writes a deployed file during
  install. Maestro never runs `compile` or `run`.

## Measured

**Sandbox.** A realpathed throwaway `HOME` per scenario, `GITHUB_TOKEN` and
`GITHUB_APM_PAT` from `gh auth token`, `COLUMNS=200`. The Harness is a local
repo served as `github.com/fimoklei/maestro-fixture-harness` through the
`GIT_CONFIG_COUNT` `insteadOf` redirect `pnpm smoke` uses, re-cloned to the
bare mirror after each tag. No run printed `GitHub API rate limit hit`.

**Harness.** `apm.yml` as the scaffold writes it (`includes: auto`, no
`targets:`), `.apm/skills/{alpha,beta}`, and one prompt per candidate path,
each body carrying a unique marker. v2 changes every prompt and skill and
adds `library/prompts/new.md` and `.maestro/prompts/new.md`.

**Consumer.** Four installs per scenario, each after writing the Selection
and `ref:` into `apm.yml`. (1) Deploy alpha at `v1.0.0`. (2) Deploy beta,
Selection alpha+beta. (3) Update target to `v2.0.0`. (4) Remove beta,
Selection alpha. The Remove step needs two skills, so the Selection grows
before it narrows. Six scenarios:

| Scenario | Scope | Targets |
|---|---|---|
| nt-p-explicit | project | `-t claude,copilot` |
| nt-p-all | project | `-t claude,copilot,cursor,opencode,gemini,windsurf,grok-build,codex` |
| nt-p-auto | project | auto-detect, `.claude/` + `.github/` present (detected: claude) |
| nt-g-explicit | `-g`, neutral cwd | `-t claude,copilot` |
| nt-g-all | `-g`, neutral cwd | all eight |
| nt-g-auto | `-g`, neutral cwd | auto-detect, `~/.claude` + `~/.copilot` present |

All 24 installs printed `Installed 1 APM dependency`, exit 0. After each
step, every file carrying a marker outside `apm_modules/` and apm's git
cache was listed, together with the lockfile's `deployed_files`.

| Candidate in the Harness | Delivered? | Status |
|---|---|---|
| `library/prompts/a.md` | no | measured |
| `library/prompts/b.prompt.md` | no | measured |
| `library/prompts/new.md` (added in v2) | no | measured |
| `prompts/c.md` | no | measured |
| `prompts/d.prompt.md` | no | measured |
| `.maestro/prompts/e.md` | no | measured |
| `.maestro/prompts/new.md` (added in v2) | no | measured |
| `docs/prompts/f.prompt.md` | no | measured |
| `commands/i.md` (Claude plugin name) | no | measured |
| `agents/o.md` (Claude plugin name) | no | measured |
| `.github/prompts/k.prompt.md` | no; the consumer's `.github/prompts/` held only `g` and `m` | measured |
| `.apm/maestro/prompts/j.md` | no | measured |
| `.apm/prompts/n.md` (wrong extension) | no | measured |
| `.apm/prompts/sub/h.prompt.md` (nested) | no | measured |
| `.apm/prompts/g.prompt.md` (control) | **yes**, every prompt-capable target, all four steps | measured |
| `m.prompt.md` at the root (control) | **yes**, same | measured |

The two controls landed where 1559 recorded, for example
`.claude/commands/g.md`, `.github/prompts/g.prompt.md`,
`~/.copilot/prompts/g.prompt.md` and `~/.codeium/windsurf/workflows/g.md`.
Codex got none. v2 rewrote both controls. The lockfile's `deployed_files`
held only control copies and skill files, never a candidate path.

**The package cache holds everything.** `apm_modules/fimoklei/<repo>/`
(project) and `~/.apm/apm_modules/fimoklei/<repo>/` (`-g`) hold the full
checkout, every candidate included, plus apm's git cache under the sandbox
`~/Library/Caches/apm/`. No tool reads those folders. They are the cache,
not a delivery.

### Side finding: the Harness's own `targets:` narrows delivery

The first run used a Harness `apm.yml` with `targets: [claude, codex]`. With
`-t claude,copilot` or all eight, prompts reached only `.claude/commands/`
and skills only `.claude/` and `.agents/`. apm intersects the consumer's
targets with the package's declared ones
(`install/target_filter.py:72-120`). The scaffold leaves `targets:`
commented out (`packages/core/src/inventory/harness-scaffold-files.ts`), so
the `nt-` runs above are the realistic case. A Harness that does declare
`targets:` delivers prompts and skills to fewer tools than the target asks
for.

## The one precondition

A `SKILL.md` at the Harness root turns the whole repo, minus `.apm/`, into
skill files (`deployable_source_plan.py:154-172`). With one present,
`.maestro/prompts/`, `prompts/` and `library/` would all ship. A skill
folder works the same way: a prompt placed inside `.apm/skills/<name>/`
ships with that skill. Keep prompts out of skill folders, and treat a root
`SKILL.md` as a broken Harness.

## Not established

- apm versions other than 0.32.0. Recheck the plan's allowlist on every apm
  upgrade (`docs/agents/apm-upgrade.md`).
- Hooks and canvas with approval granted. Neither touches `.md` files under
  a non-`.apm` folder, by source.
- The copilot-app and copilot-cowork targets, `CLAUDE_CONFIG_DIR`, Windows.
- Project auto-detect with only `.github/` present failed with
  `No harness detected`, exit 2. That was not investigated, because it is not
  a path question.
- Captures and scripts stayed in the session scratchpad and are not
  committed.
