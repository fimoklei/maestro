# What APM does with a prompt: choosing one, where it lands, how it round-trips

Date: 2026-10-16. Research only, for #1559 (map #1558, job #1403). Builds on
[833-apm-bundle-subset.md](833-apm-bundle-subset.md) § "`includes: auto` and
non-skill primitives" (`--skill` scopes skills only).

Each fact is graded **measured** (sandbox command, output captured),
**source** (installed apm source, `file:line` under
`~/.local/share/uv/tools/apm-cli/lib/python3.11/site-packages/apm_cli/`) or
**docs** ([prompts](https://microsoft.github.io/apm/producer/author-primitives/prompts/),
[manage dependencies](https://microsoft.github.io/apm/consumer/manage-dependencies/)).
`apm --version` is 0.32.0.

## Method

- **Sandbox.** `HOME` is a realpathed throwaway folder; `GITHUB_TOKEN` and
  `GITHUB_APM_PAT` come from `gh auth token`; `COLUMNS=200`.
- **Harness.** A local git repo served under the name
  `github.com/fimoklei/maestro-fixture-harness` by the `GIT_CONFIG_COUNT`
  `insteadOf` redirect that `pnpm smoke` uses. The redirect URL ends in
  `.git`, so git reads the bare mirror `<dir>.git`, and the mirror must be
  re-cloned after every new tag. The repo has `apm.yml` (`includes: auto`),
  `.apm/skills/{alpha,beta}` and `.apm/prompts/`:
  - `greet.prompt.md`: the map's shape, `description:` plus `$ARGUMENTS`.
  - `review.prompt.md`: APM's input shape, `description: "…"`,
    `mode: agent`, `input: [file]`, with `${input:file}` and `$1` in the body.
  - `plain.prompt.md` (v3 only): no front matter, plus `$ARGUMENTS`.
  - v2 changes both bodies and alpha's body. v3 adds `plain` and deletes
    `review`.
- **Consumer.** `apm install <root>#v1.0.0 --skill alpha -t
  claude,codex,copilot,cursor,opencode,gemini,windsurf,grok-build`, at
  project scope and `-g` from a neutral folder.
- **Single-file refs** need the GitHub API, so the redirect cannot serve them
  (Q1 table). They were measured read-only against the public
  `microsoft/apm-sample-package#v1.0.0`, which has `.apm/prompts/`
  `design-review` and `accessibility-audit`.
- Step ids (A1, Q1a, …) name the captures. Captures and scripts stayed in
  the session scratchpad and are not committed.

## 1. Choosing one prompt

**Answer.** A consumer can depend on one prompt file at a tag, but that is a
separate package, not a filter. The root-package dependency still deploys
every prompt in the Harness, and no consumer-side setting narrows prompts.
**Per-prompt selection beside the root-package dependency is impossible in
apm 0.32.0**: both dependencies deploy the same file and take turns owning
it.

| Fact | Provenance | Status |
|---|---|---|
| `apm install github.com/microsoft/apm-sample-package/.apm/prompts/design-review.prompt.md#v1.0.0` installs, exit 0. `apm.yml` keeps the shorthand string. The lockfile gets its own entry: `name: apm-sample-package-design-review`, `virtual_path: .apm/prompts/design-review.prompt.md`, `is_virtual: true`, `package_type: apm_package`, `resolved_ref`, `resolved_commit`, `content_hash`. It deploys `.claude/commands/design-review.md` and `.github/prompts/design-review.prompt.md`. | Q1a | measured |
| The object form `git: microsoft/apm-sample-package` + `path: .apm/prompts/accessibility-audit.prompt.md` + `ref: v1.0.0` installs the same way, and apm keeps the object form in `apm.yml`. | X2 | measured |
| A path ending in `.prompt.md`, `.instructions.md` or `.agent.md` is a virtual FILE package. apm downloads that one file over the GitHub API, not by clone, and wraps it in a synthetic package (`.apm/prompts/<file>` + a generated `apm.yml`, name `<repo>-<basename>`, version `1.0.0`). | `models/dependency/reference.py:213-285`; `deps/github_downloader.py:990-1100` | source |
| The git redirect cannot serve a single-file ref: `…/maestro-fixture-harness/.apm/prompts/greet.prompt.md#v1.0.0` fails with `not accessible or doesn't exist`, exit 1, and the created `apm.yml` is removed. Single-file deps cannot be tested offline against the smoke fixture. | X3 | measured |
| The root dependency with `--skill style-checker` still deploys both prompts, plus agents and instructions. | Q1b | measured |
| The last install owns a shared file. Root after the single-file dep: the root entry lists `design-review` in `deployed_files`, `1 prompts integrated (1 adopted)`, and the single-file entry keeps no `deployed_files` at all. Reverse order: the single-file entry takes both paths from the root entry. `deployments[].owners` names one owner. | Q1b, Q1e | measured |
| Uninstalling either dependency while the other stays leaves the shared file on disk, exit 0, and the remaining one adopts it. | Q1c, Q1f | measured |
| A remote git dependency accepts only `alias`, `allow_insecure`, `git`, `path`, `ref`, `skills`, `targets`; unknown keys fail. `skills:` scopes skills; `targets:` scopes by tool. | `models/dependency/object_fields.py:13-24`; manage-dependencies page | source + docs |
| The deploy plan adds every root `*.prompt.md` and all of `.apm/prompts/**/*.prompt.md` whenever a target takes prompts or commands. The skill subset applies only to skills. | `install/deployable_source_plan.py:116-118,174` | source |
| `--exclude` scopes MCP/LSP targets only; `--only` picks `apm` or `mcp`. Neither touches prompts. | `apm install --help` | source |

## 2. Where a prompt lands

**Answer.** Seven of the eight tested tools get a prompt file. Claude Code
gets `.claude/commands/<name>.md` (`~/.claude/commands/` under `-g`) and
Copilot gets `.github/prompts/<name>.prompt.md` (`~/.copilot/prompts/` under
`-g`). The other five use their own folders (table). **Codex gets nothing**,
at either scope.

| Target | Project | `-g` (user) | Format | Status |
|---|---|---|---|---|
| claude | `.claude/commands/<name>.md` | `~/.claude/commands/<name>.md` | command transform (§4) | measured (A1, G1) |
| copilot | `.github/prompts/<name>.prompt.md` | `~/.copilot/prompts/<name>.prompt.md` | verbatim | measured |
| cursor | `.cursor/commands/<name>.md` | `~/.cursor/commands/<name>.md` | command transform | measured |
| opencode | `.opencode/commands/<name>.md` | `~/.config/opencode/commands/<name>.md` | command transform | measured |
| windsurf | `.windsurf/workflows/<name>.md` | `~/.codeium/windsurf/workflows/<name>.md` | command transform | measured |
| grok-build | `.grok/commands/<name>.md` | `~/.grok/commands/<name>.md` | command transform | measured |
| gemini | `.gemini/commands/<name>.toml` | `~/.gemini/commands/<name>.toml` | TOML | measured |
| codex | — | — | no prompts or commands primitive | measured + source (`integration/targets.py:784`) + docs |
| kiro, antigravity, agent-skills, openclaw, hermes, grok-cloud, copilot-cowork | — | — | no prompts or commands primitive | source (`integration/targets.py`) |
| copilot-app (experimental) | — | Copilot App SQLite `workflows` table | workflow-shaped prompts only; file targets skip those | source (`targets.py:955`, `prompt_integrator.py:94,288`) |

- With an explicit `-t`, all eight targets got their files although no tool
  folder existed beforehand. The no-folder skip in
  `command_integrator.py:491` did not fire. Auto-detect was not measured.
  (measured, A1)
- `deployments[].target` for a prompt file is the tool's own name: `claude`,
  `copilot`, `cursor`, `gemini`, `grok-build`, `opencode`, `windsurf`. This
  differs from skills, whose shared copy reads `codex`/`agents`. Under `-g`
  the rows read `scope: project`, except Copilot's `~/.copilot/prompts` rows,
  which read `scope: user`. (measured, A1, G1)
- `apm uninstall -g <root ref>` left no deployed file under the sandbox home and emptied
  `~/.apm/apm.yml`'s `apm:` list. (measured, G2)

## 3. The lockfile record and `apm outdated`

**Answer.** A prompt in the Harness gets no entry and no `package_type` of
its own. Its deployed copies are plain paths under the Harness entry.
`apm outdated` works per package and per tag, so it never reports a single
prompt, and it never looks at content.

| Fact | Provenance | Status |
|---|---|---|
| Each copy appears in the Harness entry's `deployed_files` and `deployed_file_hashes`, and in one `deployments` row per file. A prompt is known only by its file name per tool (`commands/<name>.md`, `prompts/<name>.prompt.md`, `workflows/<name>.md`, `commands/<name>.toml`). | A1, G1 | measured |
| `deployed_file_hashes` hashes the deployed bytes. The five command-transform copies share one hash, which differs from the source. The Copilot copy's hash is the source's own sha256. | A1 | measured |
| `apm outdated` at v1 with v2 tagged: `outdated`, Latest `v2.0.0`, Source `git tags`. At v2 with v3 tagged: `outdated` → `v3.0.0`. At the latest tag: `All dependencies are up-to-date`, even with a locally edited prompt copy. | B1, E0b, B3, C1b | measured |
| A single-file dep is checked by its repo's tags (`git ls-remote` of the repo), like the root package. At the sample package's only tag it reads up to date. Source shows it would read `outdated` on any newer Harness tag, whether or not that prompt changed. | X1; `commands/outdated.py:280-310` | measured + source |
| Upgrade by editing `ref:` then `apm install -t …`: changed prompts are rewritten. A prompt the new release drops is cleaned from every tool (`Cleaned 6 stale files`). | B2, E1 | measured |
| An upgrade or same-ref install **silently overwrites** an edited copy of a prompt that is still in the release, exit 0, no warning. This held for Claude and Copilot copies. | C1, E1 (`greet`) | measured |
| An edited copy of a prompt the release drops is **kept** (`Kept user-edited file .claude/commands/review.md`) and stays in `deployed_files`. | E1 (`review`) | measured |
| Uninstall with that edited copy present: the copy is retained, the rest of the package's files are deleted, exit 1, `manifest and lockfile ownership were preserved`. After deleting the copy, uninstalling again prints `not found in apm_modules/`, removes the dependency from `apm.yml`, exit 0, and the lockfile is gone. | E2, X4 | measured |

## 4. Rewrites and round trip

**Answer.** The Copilot copy is the source, byte for byte. The Claude Code
copy is re-serialised, and so are the Cursor, OpenCode, Windsurf and Grok
copies, which are identical to it. Even the map's own shape loses its final
newline. Compare a deployed Claude copy with its deploy-time hash, not with
its source.

| Rewrite (command transform: claude, cursor, opencode, windsurf, grok-build) | Provenance | Status |
|---|---|---|
| Front matter is rebuilt from `description`, `allowed-tools`/`allowedTools`, `model`, `argument-hint`/`argumentHint`, `input`. Any other key is dropped with a warning (`mode` here). | A1; `command_integrator.py:46,196-271` | measured + source + docs |
| `input: [file]` becomes `arguments: [file]` plus a generated `argument-hint: <file>`, and `input:` itself leaves the copy. `${input:file}` becomes `$file`, but only for names declared in `input:`. | A1; `command_integrator.py:258` | measured + source |
| Keys come out alphabetically sorted, and YAML quoting is normalised (`"Review a file"` → `Review a file`). | A1 | measured |
| The trailing newline is dropped. Map shape (`greet`): the copy equals the source minus its last `\n`. | A1, B2 | measured |
| A prompt with no front matter gets a `---\n{}\n---\n\n` header. | E1 (`plain`) | measured |
| `$ARGUMENTS`, `$1` pass through untouched. | A1, E1 | measured |

| Other tools | Provenance | Status |
|---|---|---|
| Copilot (`.github/prompts`, `~/.copilot/prompts`): byte-identical for all three shapes (`try_adopt_identical`, link resolution only). | A1, B2, E1; `prompt_integrator.py:39-54` | measured |
| Gemini TOML: only `description` and `prompt` survive. `$ARGUMENTS` becomes `{{args}}`. A body with `$1` gets `Arguments: {{args}}\n\n` prepended. `${input:x}` is **not** rewritten. | A1, E1; `command_integrator.py:713-731` | measured + source |

Comparing a copy with its source:

- **Copilot copy:** compare its bytes with the released source directly.
- **Claude-family copy:** compare it with its `deployed_file_hashes` entry
  to tell whether it was edited since deploy. Carrying an edit back to the
  source means reversing the transform. That reversal is clean only for a
  prompt apm re-serialises losslessly, such as the map's shape: plain
  `description:` front matter plus one trailing newline. Restoring that
  newline gives the source.
- **Gemini copy:** cannot be carried back. The body is rewritten and the
  front matter is gone.

## What this means for the map

A consumer cannot pick prompts one at a time while it holds the Harness as
its root dependency. The map's per-prompt choice (a prompt Selection,
**Remove prompt** inside a target) does not survive. A single-file dependency
per prompt would add a second owner of files the root dependency already
deploys. It would also break the rule that the Harness is installed only as
its tag-pinned root ref (`.claude/rules/apm-driver.md` § Root package), and
could not be tested offline. Everything else survives:

- Prompts live in the Harness and share one release and its stages. Import
  and Edit prompt live entirely on the author side.
- The Prompts screen lists released prompts, and the copy icon copies
  released text without deploying.
- **Deploy** still works, but it deploys the Harness, so every prompt goes to
  every prompt-capable tool in the target. **Deployed to** and **Behind** are
  therefore per target. Behind means only that the Harness tag is behind,
  unless Maestro diffs each prompt's source between tags itself.
- A Codex-only target never holds a prompt.
- **Import local edits** must use the Copilot copy or reverse the Claude
  transform, which is clean only for the map's prompt shape.
- The dirty-copy guard must cover prompt files, because an upgrade silently
  overwrites an edited prompt copy.

## Not established

- Auto-detect targeting without `-t`, which may skip absent tool folders.
- `CLAUDE_CONFIG_DIR` at user scope.
- The copilot-app target, whether a single-file dep at a newer tag where its
  prompt is unchanged really reads `outdated` (source only), and Windows.
