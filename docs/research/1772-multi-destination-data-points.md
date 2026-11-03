# #1772: What products that write one thing to several places show

This note serves [#1772](https://github.com/fimoklei/maestro/issues/1772): how the Global row, its pane, and the Deploy, Update target, Remove and Import local edits dialogs show what Global is, where its skills land, and what an action touches. It builds on `docs/research/competitor-landscape-2026.md`, `docs/research/833-competitor-update.md`, `docs/research/827-competitor-journey.md`, `docs/research/1551-user-level-folders-and-detection.md` and `docs/research/1770-global-skill-cycle-walkthrough.md`, and repeats none of their findings.

**Method.** Read on 2026-11-03. I used official docs, READMEs, source at a named commit, and official screenshots. I installed and ran nothing. The source reads were:

- Vercel `npx skills`: `src/{add,list,remove,skill-lock}.ts` at `7a5e920`.
- Skills Manager: `src/i18n/en.json` and `assets/demo/*.png` at `d30530c`.
- rulesync: `src/cli/commands/generate.ts` at `2d5bbc8`.
- ruler: `src/core/apply-engine.ts` at `5e551e6`.
- chezmoi: `internal/cmd/config.go` on `main`.
- Terraform: equivalence-test plan output on `main`.

A claim marked *unverified* has no primary source behind it.

**Terms.** I write "destination" only for the products. In Maestro the glossary avoids that word. A Maestro destination is a **detected tool's skills folder**, and Global stays one **Target**.

## 1. Products × five data points

| Product | 1 Destinations listed? Detected? Pickable? | 2 Per-destination or rolled-up state; "destinations disagree" | 3 Preview before acting | 4 Side-effect locations | 5 Layout |
|---|---|---|---|---|---|
| **Vercel `npx skills`** (CLI) | Yes. It auto-detects agents ("The CLI detects installed agents and lets you choose", README). In the picker, a **locked section `Universal (.agents/skills)`** holds the agents that share `.agents/skills`. Every other agent is a checkbox with **its skills folder as the hint** (`add.ts:567-582`). With one agent detected it prints `Installing to: Claude Code` and asks nothing (`add.ts:1030-1037`). It remembers the last selection. | Per skill, not per agent. `list` prints `<name> <canonical path>`, then `Agents: Claude Code, Codex +N more`, or `not linked` in yellow (`list.ts:176-196`). A section `Missing (in the lock file, not on disk)` covers lockfile-vs-disk drift (`list.ts:285`). No per-agent drift mark. | **`Installation Summary`** box, one block per skill (`add.ts:1142-1166`): the canonical path, then `universal: Codex, Cursor…` and `symlink → Claude Code`, or `copy → …`. It also shows `files: N` and **`overwrites: <agents>`** (yellow) for each agent that already has the skill. Then `Proceed with installation?`. Remove lists `Skills to remove: • name` only, with no folders. It targets **all known agents, detected or not**, "to ensure ghost symlinks are cleaned up" (`remove.ts:246-262`). | The lockfile `~/.agents/.skill-lock.json` (or `$XDG_STATE_HOME/skills/`) is never shown in the UI (`skill-lock.ts:66-74`). The canonical copy is shown as the first summary line. | Terminal: a grouped checklist with a locked group, a summary note, and a result note: `✓ code-review (copied)` / `  → ~/.claude/skills/code-review` per unique path (`add.ts:1310-1339`). |
| **Skills Manager** (desktop, 56 tools) | Yes. Settings has `Detected Agents` and `Other Supported Agents (n)`, with the summary `{detected} detected, {enabled} enabled, {custom} custom`. The row states are `Not installed` and `Detected but disabled` (en.json:576-586). The user picks per skill via **agent icon badges** ("Click an agent icon … to install or remove that skill for that agent"). Each agent page header shows its folder: `~/.codex/skills · 18 / 18 managed / 18 in sync` ([agent-workspace.png](https://raw.githubusercontent.com/xingkongliang/skills-manager/main/assets/demo/agent-workspace.png)). Paths can be overridden (`Custom path`). | Both. Per skill card: a status chip (`In sync`, `Project only`) plus one icon per agent, coloured if present and grey if not, with `+2` overflow ([project-workspace.png](https://raw.githubusercontent.com/xingkongliang/skills-manager/main/assets/demo/project-workspace.png)). Roll-up: `Sync coverage`, `{synced} / {total} synced`. Statuses: `In sync`, `Local changed`, `Center changed`, `Conflict`, `Local only` (en.json:1122-1128). Disagreement: `"{name}": {count} variants each may hold content of their own — reconcile them into one before updating the center. Nothing was written.` (en.json:946) | A confirm sentence that names the agent: `Remove {count} selected skills from {agent}? This only unlinks them …; central library files are kept.` Update: `Updating {name} will remove {count} file(s) that the new version does not have … nothing has changed yet.` CLI: `--dry-run` on deploy, undeploy, sync, remove and adopt (README). No per-folder file list in the GUI (*unverified*). | The central library `~/.skills-manager` is named in the README and in Settings. The SQLite DB and cache are not shown in the UI (*unverified*). | Cards. A Global Workspace page has **one card per agent with a count**: `Claude Code 9 skills`, `Codex 15 skills` ([global-workspace.png](https://raw.githubusercontent.com/xingkongliang/skills-manager/main/assets/demo/global-workspace.png)). Skill cards carry an agent-badge strip. |
| **ruler** (CLI, rules → many tools) | Agents are listed in a README table with their output paths: Claude Code `.claude/skills/`, Codex `.agents/skills/`, Cursor `.cursor/skills/`. Default is "all agents enabled". The user picks with `--agents` or `default_agents`. No detection is described (*unverified*). | None. There is no status command (README). | `--dry-run`: `DRY RUN: Would write rules to: <paths>` per agent (`apply-engine.ts:534`). For skills: "shows which skills would be copied". | Shown in docs and in the repo: a `.gitignore` block marked `# START Ruler Generated Files`, and `.bak` backups of files it replaces. `ruler revert` restores them. | Log lines per agent: `Applying rules for <agent>...`. |
| **rulesync** (CLI) | Targets are chosen with `--targets` or `rulesync.jsonc`. The README has a **tool × feature table** with ✅ cells (rules, mcp, commands, subagents, skills, hooks…). `--global` writes user-scope paths. No detection. | `--check` exits 1 if any file is not up to date. That is one roll-up, not per tool. | `--dry-run`: `[DRY RUN] Would write N <feature>`, then each path indented, then `[DRY RUN] Would write N file(s) total (a + b)`. Up-to-date runs print `✓ All files are up to date (rules, skills)` (`generate.ts:68-78,255-265`). `--delete` and `--retire-targets` remove the outputs of a dropped tool. | `.gitignore` entries via `rulesync gitignore`, plus a lockfile for sources. The paths are printed in dry-run, and the lockfile has its own `--check`. | A matrix in the docs, a path list in the CLI. |
| **Claude Code `/plugin`** | Scopes, not tools. The install picks one of three options: **Install for you (user scope)**, **…for all collaborators on this repository (project scope)**, **…in this repo only (local scope)**. Each names its settings file in the docs (`~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`). The Installed tab "lists the plugin with its scope". `claude plugin list` prints `Version`, `Scope`, `Status`. | Per plugin, with the deciding source **named in the row**: `Disabled in ~/.claude/settings.json but still loads — project settings enable it, which overrides your user setting` ([loading](https://code.claude.com/docs/en/plugins/loading.md)). The Errors tab has `Plugin "<name>" is enabled in project settings but isn't installed here`. | The details pane shows **Will install** (commands, agents, skills, hooks, MCP and LSP servers), **Context cost**, and **Last updated**. Uninstall of a project-enabled plugin asks **Disable for me (y)** or **Uninstall for everyone (u)**. Removing a marketplace: the tab "names those plugins before it asks you to confirm". | Hidden in the UI, documented in full: a "plugins root" table with `cache/<marketplace>/<plugin>/<version>/`, `installed_plugins.json`, `known_marketplaces.json`, `data/`, `.trash/`. It also names three **stages**: **Declared** (settings), **Fetched** (on disk), **Loaded** (session). | A tabbed list (Discover, Installed, Marketplaces, Errors) and a details pane. Disabled plugins sit under a collapsed header. |
| **chezmoi** (dotfiles) | `chezmoi managed` lists every managed path. `--path-style` takes `absolute`, `relative`, `source-absolute` or `all`. There is one destination dir (home), so nothing to pick. | Per file, **two columns** like `git status`. Column 1 compares last-written state with actual: did someone change it since chezmoi wrote it? Column 2 compares actual with target: what `apply` will do. Letters are `A` `D` `M` `R` ([status](https://www.chezmoi.io/reference/commands/status/)). | `chezmoi diff`, and `apply --dry-run --verbose`. On apply, a file changed since the last write asks **`<path> has changed since chezmoi last wrote it`** with choices `diff`, `overwrite`, `all-overwrite`, `skip`, `Skip-conflicts`, `quit` (`config.go:1187-1195`). | The state DB `chezmoistate.boltdb` sits beside the config file. It is documented but not shown by `status`. | A two-letter status column with paths. |
| **Terraform `plan`** | Every resource is addressed by name, but providers and backends are not listed as destinations. | Per resource, plus one summary line. Drift gets its own section **before** the plan: `Note: Objects have changed outside of Terraform` / `Terraform detected the following changes made outside of Terraform since the last "terraform apply"…` with `~` lines. Then `Unless you have made equivalent changes … the following plan may include actions to undo … these changes` (equivalence test `drift_relevant_attributes/plan`). | The plan itself: a symbol legend (`+` create, `~` update in-place, `-` destroy, `-/+` replace), one block per resource (`# x will be updated in-place`), `# (1 unchanged attribute hidden)`, and a summary **`Plan: 0 to add, 2 to change, 0 to destroy.`** | The state file is not shown in plan output (*unverified*). A saved plan prints `Saved the plan to: <file>`. | A sectioned text plan: drift, then actions, then a count. |
| **Argo CD** | The Application's destination cluster and namespace are shown (*unverified* in a primary screenshot). The resource tree lists every managed object. | **Both, separately**: Sync status (`Synced`/`OutOfSync`) and Health. App health is "the worst health of its immediate child resources" ([health](https://argo-cd.readthedocs.io/en/stable/operator-manual/health/)). Each tree node carries its own heart and check marks. A collapsed node reads **`show 2 hidden resources`** ([guestbook-tree.png](https://argo-cd.readthedocs.io/en/stable/assets/guestbook-tree.png)). Orphaned (unmanaged) objects appear behind a `Show Orphaned` filter and a warning. | An `APP DIFF` button. The sync panel lets the user pick resources (Selective Sync). Prune of extraneous objects: "The app will be out of sync if Argo CD expects a resource to be pruned". `Prune=confirm` shows a `Confirm Pruning` button. | Hidden resources are collapsed but countable. | **A parent-child tree**: the app node, then resource nodes, then pods. The header shows two roll-up badges and the last sync. |
| **VS Code Settings Sync** | Machines appear in `Synced Machines` (rename, turn off sync remotely). Data categories are chosen at setup: Settings, Keyboard Shortcuts, Snippets, Tasks, MCP Servers, UI State, Extensions, Profiles, Prompts and Instructions. | Per-machine state is not documented (*unverified*). Conflicts get `Accept Local`/`Replace Remote`, `Accept Remote`/`Replace Local`, and `Show Conflicts`, which opens a diff editor. | None before sync. Turning on "automatically merges". | Remote backups (last 20 per category) and local backups (30 days) are reachable via `Show Synced Data` and `Open Local Backups Folder`. The folder path is not given. | Tree views: Synced Machines and Synced Data. |
| **Home Manager** (Nix) | Generations, listed as `date : id N -> /nix/store/… (current)`. | One current generation. | No dry-run is documented for file links (*unverified*). A collision aborts **before** any change: `Existing file '/home/jdoe/.config/git/config' is in the way`. `-b backup` moves the file aside to `….backup`. | Store paths are printed in `generations`. | A text list with a `(current)` marker. |

Checked and not used: JetBrains settings sync and Homebrew. Homebrew was covered in 833. Neither writes one thing into several user-chosen folders.

## 2. Patterns

Each pattern below is followed by what it would look like in Maestro, on the two-tool machine (Claude Code + Codex) with the fixture: skills code-review, commit-message and release-notes; Global on v1.1.0; v2.0.0 changes code-review, removes release-notes, and adds test-plan.

**P1. Group destinations by shared folder, not by tool.** Used by `npx skills`: the locked `Universal (.agents/skills)` group, folder as checkbox hint, a summary line per canonical path. Skills Manager puts the folder under the agent name in each page header. Why it matters for Maestro: Codex, Cursor and OpenCode all read `~/.agents/skills`, and Cursor and OpenCode also read `~/.claude/skills` (1551). One folder has many readers. A row per tool repeats a folder; a row per folder does not.
→ Child rows `~/.claude/skills` · Claude Code and `~/.agents/skills` · Codex. A hover lists "also read by Cursor, OpenCode".

**P2. Split detected, not detected, and disabled.** Used by Skills Manager (`Detected Agents` / `Other Supported Agents (n)` / `Not installed` / `Detected but disabled`) and `npx skills` (auto-detect; remove targets all known agents for ghost links).
→ On a one-tool machine the Global group still shows a muted line `~/.agents/skills · Codex not detected · not written`. The Remove dialog says whether an undetected folder is left alone (#1774).

**P3. A rolled-up status equal to the worst child, with a mark per child.** Used by Argo CD (app health = worst child; node marks in the tree) and Skills Manager (`18 / 18 managed / 18 in sync`, `Sync coverage`). This matches the existing rule in design.md that a row shows its worst reading.
→ The Global parent shows `Local edits` when either folder has edits. The children show `✓` and `⚠` marks only, no badges, so the "one coloured mark per row" rule holds per row.

**P4. Presence badges per destination on each item.** Used by Skills Manager (agent icon strip, grey when absent, `+2` overflow) and `npx skills list` (`Agents: Claude Code, Codex`).
→ A pane sub-list row `code-review` · `v1.1.0` · `2 of 2 folders`. Variant C's skills × tools matrix is the full form of this.

**P5. A plan with symbols and one count line.** Used by Terraform (`+ ~ - -/+`, `Plan: 0 to add, 2 to change, 0 to destroy.`), rulesync (`[DRY RUN] Would write N file(s) total`, with paths), ruler (`Would write rules to: <paths>`) and `npx skills` (`Installation Summary`). Claude Code's **Will install** is the same idea at component level.
→ Update dialog: `~ code-review`, `- release-notes`, `= commit-message`, with the summary `2 folders · 1 changed, 1 removed, 1 unchanged`.

**P6. Show drift first, and name what the action will overwrite.** Used by:
- Terraform: a section `Objects have changed outside of Terraform`, placed before the plan.
- chezmoi: `<path> has changed since chezmoi last wrote it` with diff, overwrite or skip.
- `npx skills`: `overwrites: <agents>`.
- Skills Manager: `will remove {count} file(s) … nothing has changed yet`.
- Home Manager: `Existing file … is in the way`, which aborts before writing.

→ The Update dialog opens with `Changed outside Maestro: ~/.agents/skills/code-review — Update target overwrites these edits. To keep them, select Import local edits first.`

**P7. Name the stages and give each one a file.** Used by Claude Code (**Declared** in settings → **Fetched** in `~/.claude/plugins/cache` → **Loaded** in the session), chezmoi (target / last written / actual) and Argo CD (target state / live state).
→ Global has three stages too:

- **Record**: `~/.apm/apm.yml` and `apm.lock.yaml` (ref v1.1.0, 3 skills).
- **Release copy**: `~/.apm/apm_modules`, the whole v1.1.0 release.
- **Folders**: `~/.claude/skills`, `~/.agents/skills`.

This answers the 1770 miss: test-plan is `not added`, yet it lands in `~/.apm`.

**P8. When destinations disagree, name the source and the rule.** Used by:
- Claude Code: `Disabled in ~/.claude/settings.json but still loads — project settings enable it…`
- Skills Manager: `{count} variants each may hold content of their own — reconcile them into one … Nothing was written.`
- VS Code: `Accept Local` / `Accept Remote` / `Show Conflicts` (diff).

→ Pane notice on differing copies: `~/.claude/skills/code-review and ~/.agents/skills/code-review differ. Import local edits needs one copy. Select Import skill on the Harness screen and choose one.`

**P9. Collapse the bookkeeping, but keep it countable.** Used by Argo CD (`show 2 hidden resources`, the `Show Orphaned` filter), ruler (a marked `.gitignore` block, `.bak` files) and Terraform (`# (1 unchanged attribute hidden)`).
→ A last muted child `~/.apm · deployment record and release copy`, closed by default.

**P10. The result repeats the preview's structure.** Used by `npx skills` (`✓ code-review (copied)` then `→ ~/.claude/skills/code-review` per path) and rulesync (`Written N <feature>` plus paths).
→ The report keeps the dialog's per-folder lines and turns each into a `✓` or `✕`.

## 3. Two candidate variants

Both keep Global as **one Target with one row status** and follow design.md: one-line rows, one badge per row, and a pane made of facts, paragraph, notice, sub-list. Neither lets the user pick folders.

### Variant D: "Layers" (P7 stage model, with P6 and P9)

The idea is to show **what Maestro writes in which order**, not a list of tools. It is structurally different from B: Global has **no child rows**, and the dialogs are a numbered pipeline.

- **Row:** one line, `Global` · `Behind` · `v1.1.0 → v2.0.0` · `3`, and as machine value `2 folders`. The hover body reads `Claude Code and Codex load these 3 skills in every repository.`
- **Pane facts:** Target Global · Release v1.1.0 · Latest v2.0.0 · Deployed skills 3 · Folders 2.
- **Pane sub-list:** grouped by layer.
  - **1 Record**: `~/.apm/apm.yml` · `v1.1.0 · 3 skills`.
  - **2 Release copy**: `~/.apm/apm_modules` · `v1.1.0 · whole release`.
  - **3 Folders**: `✓ ~/.claude/skills` · `3`, and `⚠ ~/.agents/skills` · `Local edits`. On a one-tool machine: `– ~/.agents/skills · Codex not detected`.
- **Deploy dialog:** a `What happens` list.
  1. Record: adds code-review (v1.1.0).
  2. Release copy: keeps or fetches the whole v1.1.0 release in `~/.apm/apm_modules`.
  3. Folders: writes `code-review/` to `~/.claude/skills` and `~/.agents/skills`.
- **Update target dialog:**
  1. Record: v1.1.0 → v2.0.0.
  2. Release copy: replaced with v2.0.0, *includes test-plan, not deployed*.
  3. Folders, each: `~ code-review`, `- release-notes`, `= commit-message`.

  The step-3 line is preceded by the P6 drift line when a folder has local edits.
- **Remove dialog:**
  1. Record: drops commit-message.
  2. Release copy: unchanged.
  3. Folders: deletes `commit-message/` from both.

  Below the list: "The Harness keeps the skill."
- **Import local edits dialog:** the same three layers, read in reverse. The source is `~/.agents/skills/code-review`. The target is the Harness clone `…/.apm/skills/code-review`, uncommitted. Layers 1–3 stay unchanged until a release and Update target.
- **Adds:** side-effect locations (`~/.apm`, `apm_modules`), the write order, and the "not deployed but copied" fact. The layers are a fixed structure, so the same block serves both machines.

### Variant E: "Folder groups with a drift gate" (P1, P2, P3, P6, P10)

The idea is that **the folder is the unit**, and the dialogs stop at drift first. It differs from B in two ways: child rows are folders listing their readers, not tools; the dialogs are per-folder blocks with a gate. It differs from C because there is no file-level change list and no matrix.

- **Row:** parent `Global` · worst status (P3) · `v1.1.0` · `3`. Children (read-only, one line, one mark each):
  - `✓ ~/.claude/skills` · `Claude Code`.
  - `⚠ ~/.agents/skills` · `Codex +2 readers`. The hover reads: `Also read by Cursor and OpenCode.`
  - `– Not detected: 0`, or on a one-tool machine `– ~/.agents/skills · Codex not detected · not written` (P2).
  - Last child, muted and collapsed: `~/.apm · deployment record` (P9).
- **Pane** (on a folder child): Folder `~/.agents/skills` · Read by Codex, Cursor, OpenCode · Release v1.1.0 · Skills 3 of 3. The sub-list holds skills with a per-folder mark: `⚠ code-review · local edits`. If both folders have edits that differ, a P8 notice names both paths.
- **Deploy dialog:** one block per folder, like the `npx skills` summary:
  - `~/.claude/skills` · `+ code-review`
  - `~/.agents/skills` · `+ code-review` · `overwrites an existing copy` when one exists.

  Then one line `Also changes ~/.apm (deployment record)`. A count footer reads `2 folders · 1 skill`.
- **Update target dialog:** section 1 is **`Changed outside Maestro`** (the P6 gate). It reads `~/.agents/skills/code-review has local edits. Update target overwrites them.` The primary button is `Import local edits`, and `Update anyway` is secondary. Section 2 holds the per-folder blocks with `~ - =` lines, plus `+ test-plan (in ~/.apm only, not deployed)`. Count line: `Plan: 1 changed, 1 removed, 1 unchanged, in 2 folders.`
- **Remove dialog:** per-folder blocks `- commit-message`. An undetected folder shows `~/.agents/skills · not detected · left as is` (P2, #1774).
- **Import local edits dialog:** per-folder blocks with a match mark. When the copies match (`= same edits in 2 folders`), one import goes to the Harness clone. When they differ, the blocks show `≠` and the dialog states the P8 rule before the button, never after.
- **Report (P10):** the same blocks, each line marked `✓` or `✕`.
- **Adds:** readers per folder, not-detected folders, the drift gate before overwrite, the overwrite flag per folder, and preview and report in one shape.

## Sources

- Vercel skills: <https://github.com/vercel-labs/skills> (README, `docs/agents.md`, `docs/commands.md`, `src/add.ts`, `src/list.ts`, `src/remove.ts`, `src/skill-lock.ts` at `7a5e920`)
- Skills Manager: <https://github.com/xingkongliang/skills-manager> (README, `src/i18n/en.json`, `assets/demo/{global-workspace,agent-workspace,project-workspace}.png` at `d30530c`)
- ruler: <https://github.com/intellectronica/ruler> (README, `src/core/apply-engine.ts` at `5e551e6`)
- rulesync: <https://github.com/dyoshikawa/rulesync> (README, `docs/guide/dry-run.md`, `docs/reference/cli-commands.md`, `src/cli/commands/generate.ts` at `2d5bbc8`)
- Claude Code: <https://code.claude.com/docs/en/discover-plugins>, <https://code.claude.com/docs/en/plugins/loading.md>
- chezmoi: <https://www.chezmoi.io/reference/commands/status/>, <https://www.chezmoi.io/reference/commands/apply/>, <https://www.chezmoi.io/reference/commands/managed/>, `internal/cmd/config.go`, `assets/chezmoi.io/docs/reference/command-line-flags/global.md` in <https://github.com/twpayne/chezmoi>
- Terraform: <https://developer.hashicorp.com/terraform/cli/commands/plan>, `testing/equivalence-tests/outputs/drift_relevant_attributes/plan` in <https://github.com/hashicorp/terraform>
- Argo CD: <https://argo-cd.readthedocs.io/en/stable/core_concepts/>, <https://argo-cd.readthedocs.io/en/stable/operator-manual/health/>, <https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/>, <https://argo-cd.readthedocs.io/en/stable/user-guide/selective_sync/>, <https://argo-cd.readthedocs.io/en/stable/user-guide/orphaned-resources/>, <https://argo-cd.readthedocs.io/en/stable/getting_started/> (screenshot `assets/guestbook-tree.png`)
- VS Code: <https://code.visualstudio.com/docs/configure/settings-sync>
- Home Manager: <https://nix-community.github.io/home-manager/usage/dotfiles.html>, <https://nix-community.github.io/home-manager/usage/rollbacks.html>

## Not verified

- The Skills Manager GUI preview before sync: does a per-folder file list exist? Also whether its DB or cache path is shown in the UI.
- Whether ruler detects installed agents.
- How the Argo CD sync panel looks (per-resource checkboxes, prune list). The docs describe Selective Sync without a screenshot. The destination cluster and namespace on the app page also lack a primary screenshot.
- Whether Terraform plan output names the state file.
- VS Code Settings Sync per-machine status, and the local backup folder path.
- A Home Manager dry run for file links.
- `npx skills` writes the Cursor global folder as `~/.cursor/skills` (`docs/agents.md`). apm writes `~/.agents/skills` for Cursor (1551). This is a conflict between two writers, not between sources; see 1551 for which folders Cursor reads.
- The variants D and E were mocked, not tested with a user. #1772 chose a later variant, G: P1 and P3 as child rows per folder, one skill list per dialog, a folder block only when it deviates, and no `~/.apm` (P7 and P9 dropped).
