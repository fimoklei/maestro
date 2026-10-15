# User-level skills folders apm writes, and how to tell a tool is installed

Serves [#1551](https://github.com/fimoklei/maestro/issues/1551), a research
ticket of the wayfinder map #1549. Nothing here was applied to the code, the
glossary, the ADRs or `docs/apm-behavior.md`.

**Method.** Read on 2026-10-15. apm source: the pinned 0.32.0
(`scripts/bootstrap.mjs:8`). The installed tool's
`site-packages/apm_cli/integration/targets.py` is byte-identical to the uv
cache copy `~/.cache/uv/archive-v0/35E4EeruXmytYE2Z/` (`cmp`). The 0.29.0 →
0.32.0 diff of that file touches project-scope path checks only, so
`docs/apm-behavior.md`'s user-scope reading still holds. Tool docs were
fetched the same day; they carry no version unless noted. The machine was
checked read-only (`test -e`, `ls`, `command -v`). Nothing was installed.
"Reliable" means a first-party source states it. "Guess" means it is inferred
or unstated.

## 1. apm targets that deploy skills at user scope (`-g`)

`for_scope(user_scope=True)` swaps `root_dir` for `user_root_dir`
(`targets.py:432`). The skills folder is `deploy_root or root_dir` +
`/skills` (`skill_integrator.py:313`, `:400`). A skills `deploy_root=".agents"`
survives the swap, so those targets keep `~/.agents/skills` at home.

| apm target | User-scope skills folder | Shares the folder with | Gate | Source (`targets.py`, 0.32.0) |
|---|---|---|---|---|
| `copilot` | `~/.agents/skills` | cursor, gemini, codex, windsurf, agent-skills | — | 536–541, 548 |
| `cursor` | `~/.agents/skills` | same six | — | 608–613, 619 |
| `gemini` | `~/.agents/skills` | same six | — | 690–695, 701 |
| `codex` | `~/.agents/skills` | same six | — | 789–794, no `user_root_dir` |
| `windsurf` | `~/.agents/skills` | same six | — | 833–838, 845 |
| `agent-skills` | `~/.agents/skills` | same six | explicit only | 858–867 |
| `claude` | `~/.claude/skills`, or `$CLAUDE_CONFIG_DIR/skills` | none | — | 561–580, 434–457 |
| `kiro` | `~/.kiro/skills` | none | — | 645, 650–651 |
| `opencode` | `~/.config/opencode/skills` | none | — | 671, 673–675 (override drops `.agents`) |
| `grok-build` | `~/.grok/skills` | grok-cloud | — | 715, 719–720 |
| `grok-cloud` | `~/.grok/skills` | grok-build | explicit only, flag `grok_cloud` | 728, 732–733 |
| `antigravity` | `~/.gemini/antigravity-cli/skills` | none | explicit only | 767–771, 777 |
| `openclaw` | `~/.openclaw/skills` | none | flag `openclaw` | 883–892 |
| `hermes` | `~/.hermes/skills`, or `$HERMES_HOME/skills` | none | explicit only | 906–915, 437–441 |
| `copilot-cowork` | `<OneDrive>/Documents/Cowork/skills` (resolved at run time) | none | flag `copilot_cowork` | 922–944; `copilot_cowork_paths.py:75` |

Gates come from `core/target_catalog.py:157–216`. `copilot-app` is
user-scope but deploys prompts only (`targets.py:955–972`). With `-t`, apm
writes a folder even when the tool is absent; `auto_create=False` does not
stop it (`docs/apm-behavior.md` § Global scope, measured;
`core/target_detection.py:815`). `APM_LEGACY_SKILL_PATHS=1` drops every
`.agents` override and sends skills to per-tool roots (`targets.py:1032–1069`).
Maestro does not set it.

**Ten apm-written folders.** Six targets write `~/.agents/skills`. Each of
the other nine folders has one apm writer, except `~/.grok/skills`, which has
two.

## 2. Who reads each folder, by the tools' own docs

The map lets the user choose a folder, not a tool, so what counts is who
*reads* each folder. That is wider than who writes it.

| Folder | Readers named by their own docs |
|---|---|
| `~/.agents/skills` | Codex [1], Copilot CLI [2], Cursor [3], Gemini CLI [4] (its alias outranks `~/.gemini/skills`), Devin Desktop / Windsurf [5], OpenCode [6], Grok Build [7], OpenClaw [8] |
| `~/.claude/skills` | Claude Code [9], **Cursor** [3] ("for compatibility"), **OpenCode** [6], **Devin Desktop** [5] (only with Claude Code config reading on). Grok says it reads Claude Code skills, path not given [7] |
| `~/.kiro/skills` | Kiro [10] |
| `~/.config/opencode/skills` | OpenCode [6] |
| `~/.grok/skills` | Grok Build [7] |
| `~/.gemini/antigravity-cli/skills` | Antigravity CLI only. The Antigravity app and IDE read `~/.gemini/config/skills`, which apm never writes [11] |
| `~/.openclaw/skills` | OpenClaw, "managed/local" tier 4 [8] |
| `~/.hermes/skills` | Hermes [12] |

Cursor also reads `~/.cursor/skills` and `~/.codex/skills` [3]. Copilot CLI
also reads `~/.copilot/skills` [2]. Neither folder is an apm user-scope
target.

## 3. How Maestro detects a tool today

`ToolPresenceAdapter.detectGlobalTools` (`packages/core/src/tools/tool-presence.ts:17–26`)
checks one file per tool under `HOME`. The files are listed in
`DEPLOY_TOOLS` (`packages/core/src/deploy/deploy-tools.ts:17–31`):
`~/.claude.json` for Claude Code and `~/.codex/config.toml` for Codex.
ADR-0011 chose a config file because a deploy can create a folder
(`docs/apm-behavior.md` § Global scope). The same table sets
`skillsDirIsExclusive: true` for Claude (`deploy-tools.ts:22`).
`reclaimableUntargetedTools` uses that flag to remove the Claude copy when
Claude Code is not detected (ADR-0011 #202 amendment, ADR-0013).

## 4. A cheap install signal per tool

A folder is a weak signal for every tool here, because apm creates it. Proof
on this machine: `~/.grok/` holds only `hooks/` and `skills/`, with no
`config.toml` and no `grok` on `PATH`, so something other than Grok made it.

| Tool | Signal | Moved by | Reliability |
|---|---|---|---|
| Claude Code | `~/.claude.json` | `CLAUDE_CONFIG_DIR`? (see § 5) | **Reliable** when the variable is unset: Claude Code "writes [it] for itself" [13] |
| Codex | `~/.codex/config.toml` | `CODEX_HOME` [14] | **Guess.** The docs say config *lives* there, not that Codex creates it on first run [14]. A Codex user with no config is a false negative |
| Copilot CLI | `~/.copilot/settings.json` (`config.json` is internal state) | `COPILOT_HOME` [15] | Guess. First-run creation not stated. apm's `copilot` target writes into `~/.copilot` |
| Cursor | `~/.cursor/cli-config.json` (CLI only) | `CURSOR_CONFIG_DIR`, `XDG_CONFIG_HOME` [16] | Guess. Absent on this machine, which has Cursor.app and a `~/.cursor/` folder. The IDE has no documented marker |
| Gemini CLI | `~/.gemini/settings.json` | `GEMINI_CLI_HOME` [17] | Guess. Antigravity shares `~/.gemini/`, and apm merges `gemini` hooks into this very file (`targets.py:702`) |
| Devin Desktop / Windsurf | `~/.codeium/windsurf/` | — | Guess. apm's `windsurf` target writes there (`targets.py:845`) |
| Kiro | `~/.kiro/settings/cli.json` | `KIRO_HOME` [18] | Guess (CLI page, via search). Not measured on the IDE |
| OpenCode | `~/.config/opencode/opencode.json` [19] | `OPENCODE_CONFIG*` add files, do not move it [19] | Guess. This machine has `opencode.jsonc`, so a `.json`-only check misses it |
| Grok Build | `~/.grok/config.toml` | `GROK_HOME` [20] | Guess. The folder alone is a proven false positive (above) |
| Antigravity CLI | none found | — | Guess. No config path found in the docs read |
| OpenClaw | `~/.openclaw/openclaw.json` [8] | `OPENCLAW_STATE_DIR` moves the skills dir [8] | Guess |
| Hermes | `~/.hermes/config.yaml` [12] | `HERMES_HOME` [12] | Guess |
| Copilot Cowork | a OneDrive mount under `~/Library/CloudStorage/OneDrive*` | `APM_COPILOT_COWORK_SKILLS_DIR` | Reliable as apm's own gate: `for_scope` returns no target when the mount is missing (`copilot_cowork_paths.py:75–83`) |

A binary on `PATH` (`claude`, `codex`, `gemini`, `opencode` resolve here) is
another cheap signal. It is still a guess: the server's `PATH` can differ
from the user's shell. apm honours only `CLAUDE_CONFIG_DIR` and `HERMES_HOME`
(`targets.py:437–441`). When any other variable above is set, apm writes the
default folder and the tool reads elsewhere.

## 5. `CLAUDE_CONFIG_DIR`

- **apm (reliable, source).** At user scope the `claude` root becomes the
  variable's path. apm stores it home-relative, or absolute outside `$HOME`
  (`targets.py:434–457`). The lockfile then records
  `<dir>/skills/<name>`, not `.claude/skills/<name>`.
- **Claude Code (reliable, docs).** The variable "override[s] the
  configuration directory (default: `~/.claude`)". It can be set in the
  shell, in user settings or in managed settings [21]. Every `~/.claude` path
  then lives under it [22].
- **`~/.claude.json` (guess).** The official docs do not say whether it
  moves. A user report, anthropics/claude-code#3833, says it lands in the
  custom directory.
- **Maestro today (derived from code, not measured).** The marker is read at
  the real home (`tool-presence.ts:21`). Deploy-state matches deployed files
  on the `.claude/` prefix (`group-primitives-by-tool.ts:147–151`), so a
  `.claude-work/skills/x` entry would not show. Maestro only sees the
  variable if it is in the server's environment. A shell alias or a
  `settings.json` `env` entry would not reach Maestro [21].

## Findings that bear on the map

1. **`~/.claude/skills` has more than one reader.** Cursor, OpenCode and
   Devin Desktop (opt-in) read it, by their own docs. This contradicts
   `skillsDirIsExclusive: true` (`deploy-tools.ts:22`) and the #202
   amendment's "Claude Code's skills directory qualifies". On a machine with
   Cursor and no `~/.claude.json`, the cleanup would remove skills Cursor
   reads.
2. **Cursor and OpenCode read both shared folders.** A skill deployed to
   `~/.claude/skills` and `~/.agents/skills` reaches them twice. Whether they
   de-duplicate it is unmeasured.
3. **Codex's marker is a guess, like Claude Code's under
   `CLAUDE_CONFIG_DIR`.**
4. **Antigravity's app and IDE do not read the folder apm writes.**

## Unmeasured

- `CLAUDE_CONFIG_DIR` and `CODEX_HOME` in a sandbox: where the marker lands
  and what Deploy-state shows.
- Which marker file each non-Claude tool writes on first run.
- Kiro, Grok Build, OpenClaw, Hermes, Copilot CLI, Antigravity CLI and
  Copilot Cowork are absent here. No signal was seen on a real install.
- How a tool behaves when one skill name sits in two folders it reads.

## Sources

1. Codex, Build skills — <https://learn.chatgpt.com/docs/build-skills> (USER: `$HOME/.agents/skills`)
2. GitHub Docs, Copilot CLI create skills — <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-skills>
3. Cursor, Skills — <https://cursor.com/docs/context/skills>
4. Gemini CLI, Skills — <https://geminicli.com/docs/cli/skills/>
5. Devin Desktop (formerly Windsurf), Cascade skills — <https://docs.devin.ai/desktop/cascade/skills>
6. OpenCode, Skills — <https://opencode.ai/docs/skills/>
7. xAI, Grok Build skills, plugins, marketplaces — <https://docs.x.ai/build/features/skills-plugins-marketplaces>
8. OpenClaw, Skills — <https://docs.openclaw.ai/tools/skills>
9. Claude Code, Skills — <https://code.claude.com/docs/en/skills>
10. Kiro, Skills — <https://kiro.dev/docs/skills/>
11. Antigravity, Skills — <https://antigravity.google/docs/skills>
12. Hermes Agent, Configuration — <https://hermes-agent.nousresearch.com/docs/user-guide/configuration/>
13. Claude Code, Settings — <https://code.claude.com/docs/en/settings>
14. Codex, Config basics and advanced — <https://learn.chatgpt.com/docs/config-file/config-basic>, <https://learn.chatgpt.com/docs/config-file/config-advanced>
15. GitHub Docs, Copilot CLI config directory — <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference>
16. Cursor CLI, Configuration — <https://cursor.com/docs/cli/reference/configuration>
17. Gemini CLI, Configuration — <https://geminicli.com/docs/reference/configuration/>
18. Kiro, Configuration — <https://kiro.dev/docs/configuration/> (via search summary)
19. OpenCode, Config — <https://opencode.ai/docs/config/>
20. xAI, Grok Build settings — <https://docs.x.ai/build/settings>
21. Claude Code, Environment variables — <https://code.claude.com/docs/en/env-vars>
22. Claude Code, The .claude directory — <https://code.claude.com/docs/en/claude-directory>
