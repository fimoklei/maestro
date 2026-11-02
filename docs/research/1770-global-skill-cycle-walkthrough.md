# #1770 — Global skill cycle walkthrough: screen against disk

#1770 (map #1768): what each Global skill action wrote on disk, next to what
the screen said; a prediction test on the current screens and on a mock of
the proposals; the proposals and the objections to them.

## Setup

- apm 0.32.0. Maestro at `47506f87` (main). `pnpm smoke` + `pnpm smoke:ready --scenario empty`, light theme, 1440×900.
- Sandbox HOME `<worktree>/.maestro-sandbox/home`; `realpath` equals the path (no symlink component), checked before every snapshot. `MAESTRO_HOME` = `<worktree>/.maestro-sandbox`. Real `~` and `~/.maestro` never touched.
- Harness: the fixture Harness (`fimoklei/maestro-fixture-harness`, releases v1.0.0, v1.1.0, v2.0.0; skills at v1.1.0: code-review, commit-message, release-notes; at v2.0.0: code-review (changed), commit-message (same), test-plan (new)).
- To start Global at v1.1.0 and later make it *behind*, the fixture bare repo was republished up to v1.1.0 (`publishFixtureRelease`), the sandbox clone reset to the v1.1.0 commit, and `/api/harness/refresh` called; after the deploys, republished up to v2.0.0, clone fast-forwarded, refreshed. Release refs are fetched with `--prune`, so v2.0.0 disappeared and reappeared as intended.
- Machines:
  - **two-tool**: default seed, `~/.claude.json` + `~/.codex/config.toml`. Maestro showed `Global 2` → rows `Claude Code`, `Codex`; picker `Global (Claude Code + Codex)`.
  - **one-tool**: re-ran `smoke:ready --scenario empty` (wipes `~/.apm/apm.yml`, lockfile, `apm_modules`, `~/.claude/skills`, `~/.agents/skills`), then `rm -rf home/.codex`. No restart needed: presence is probed per read (`packages/core/src/tools/tool-presence.ts`). Maestro showed `Global 1` → row `Claude Code`; picker `Global (Claude Code)`. Leftovers kept: empty `~/.claude`, `~/.agents`, `~/.apm/config.json`, `~/.apm/.apm-lifecycle.lock`.
- Snapshot: `find` + `shasum` over the whole home, pruning `Projects/`, `Library/`, `.cache/` and `.git`; plus symlinks, empty dirs and `MAESTRO_HOME/config.json`. Diffed per action. No symlink appeared at any point. `.claude.json`, `.codex/`, `.gitconfig`, `.local/` never changed. `MAESTRO_HOME/config.json` changed only in `harnessFreshness.lastFetchedAt`; `targetOperations` ended `[]` each time.
- Screen text: `innerText` of the dialog, grid, pane or hover card (`data-radix-popper-content-wrapper`) via `agent-browser --session maestro-halibut`. Hover cards opened with a real mouse move onto the Status badge.
- Screenshots: `~/Pictures/maestro/1770-global-walkthrough/`, names `<machine>-<nn>-<action>-<step>.png`.
- Setup artefact: the first two-tool deploy, before the clone reset, failed `Harness copy unreleased` (`Nothing was deployed. Select Create a release on the Harness screen, then deploy again.`). Disk: only `~/.apm/config.json` (`{"default_client": "vscode"}`) created. Not a Global finding; its screenshot was overwritten by the retry.

Paths below are relative to the sandbox home. `apm_modules/…` = `.apm/apm_modules/fimoklei/maestro-fixture-harness/`.

## Two-tool machine (Claude Code + Codex)

| # | Action | Where triggered | Screen text before acting | Disk change (per folder) | Screenshots | Mismatch / silence |
|---|---|---|---|---|---|---|
| 1 | Deploy code-review to Global | Skills → row ⋮ `Actions for code-review` → `Deploy skill` | Dialog `Deploy 1 skill`; field `Target`; options `Global (Claude Code + Codex)`, `…/scenarios/empty`; after choice `To deploy · 1` `code-review`; button `Deploy skill`. Report: `Deployed 1 of 1 skill to Global` / `Deployed 1` `code-review v1.1.0` | `.claude/skills/code-review/SKILL.md` created. `.agents/skills/code-review/SKILL.md` created. `.apm/`: `apm.yml` (targets `claude, codex`; dependency `ref: v1.1.0`, `skills: [code-review]`), `apm.lock.yaml`, `.apm-lifecycle.lock` created; `apm_modules/` created with **all three skills and three `.maestro/prompts/*.md`**. `.codex/` untouched. | two-tool-01-row-deploy-0…6 | No folder named at the choice point or in the Report. Codex label, but the copy lands in `.agents`, not `.codex`. `.apm/` and the full Harness copy in `apm_modules` not mentioned. |
| 2 | Deploy commit-message + release-notes to Global | Skills → check two rows → selection bar `Deploy skills` | Dialog `Deploy 2 skills`; same two options; `To deploy · 2` `commit-message` `release-notes`; button `Deploy skills`. Report `Deployed 2 of 2 skills to Global` | `.claude/skills/{commit-message,release-notes}/SKILL.md` created. `.agents/skills/{…}` created. `.apm/apm.yml` + lockfile modified (skills list now 3). code-review copies untouched (same hash). | two-tool-02-bulk-deploy-1…4 | Same as #1. |
| 3a | Read Global group, in sync | Deploy-state | Group `Global 2`; rows `Claude Code` `In sync` `v1.1.0` `3`; `Codex` `In sync` `v1.1.0` `3`. Band `Targets 3`. Hover (both rows): `In sync` `v1.1.0` / `On the latest release.` / `Read 1 min ago`. Pane Claude Code: `Target Global`, `Folder path ~/.claude/skills`, `Release v1.1.0`, `Deployed skills 3`. Pane Codex: same, `Folder path ~/.agents/skills`. Row ⋮: `Deploy skill`. | none (read only) | two-tool-03-deploy-state-1…5 | Group header says nothing about what Global is. Folder path is shown only in the pane. Skills screen counts Global as 2 targets (`Targets 2`, `Deployed to 2` `Claude Code v1.1.0` `Codex v1.1.0`, two-tool-02-bulk-deploy-1-bar). |
| 3b | Read Global group, behind | Deploy-state after v2.0.0 | Rows `Behind` `v1.1.0 → v2.0.0` `3` (both). Hover (both, identical): `2 of 3 deployed skills changed in v2.0.0. Select Update targets to move this target to v2.0.0.` Pane: `Latest release v2.0.0` + button `Update targets` (accessible name `Update targets Claude Code and Codex`), `Changed 2 of 3 skills: code-review and release-notes`, same paragraph; sub-list `↑ code-review v1.1.0 → v2.0.0`, `✓ commit-message`, `⚠ release-notes`. Sub-row ⋮: `View skill on GitHub`, `Remove skill`. Row ⋮: `Deploy skill`, `Update targets`. | none (re-read changed nothing) | two-tool-03-deploy-state-7…9, two-tool-04-update-1, -2, -4 | Card and pane say "this target" on a per-tool row while the control is `Update targets`. Each row repeats the same card. |
| 4 | Update target | Deploy-state → Claude Code row ⋮ → `Update targets` | Dialog title `Update Claude Code and Codex`; `release v1.1.0 → v2.0.0`; `Updates 1 skill, removes 1, leaves 1 unchanged.`; `Changed code-review`; `Removed by this release release-notes`; `Unchanged (1) commit-message`; `New in this release (1) · not added test-plan`; button `Update target`. Report: `Updated to v2.0.0`; `Updated 2` `code-review v2.0.0` `commit-message v2.0.0`; `Removed 1` `release-notes`. | `.claude/skills/code-review` modified, `.agents/skills/code-review` modified. `.claude/skills/release-notes` deleted, `.agents/skills/release-notes` deleted (dirs gone). commit-message copies untouched. `.apm/apm.yml` (`ref: v2.0.0`, skills `code-review, commit-message`) + lockfile modified. `apm_modules/`: `.apm-pin` + code-review modified, release-notes deleted, **test-plan created**. | two-tool-04-update-6…9 | Title names both tools; button says `Update target` (singular). Report puts commit-message under `Updated`, though the dialog said unchanged and its files did not change. `not added` test-plan still lands in `apm_modules`. No folder named. |
| 5 | Remove commit-message from Global | Deploy-state → Claude Code pane → sub-row ⋮ `Actions for commit-message` → `Remove skill` | Dialog `Remove commit-message v2.0.0`; `Removes the skill from:` `Claude Code` `Codex`; `The Harness keeps the skill. To add it back, select Deploy skill.`; buttons `Cancel`, `Remove skill`. After: no dialog, no toast; rows show `1` skill; pane lists code-review only. | `.claude/skills/commit-message` deleted, `.agents/skills/commit-message` deleted. `.apm/apm.yml` (skills `[code-review]`) + lockfile modified. `apm_modules/…/commit-message` kept. | two-tool-05-remove-1…3 | Opened from the Claude Code row, acts on both — but the dialog lists both tools before acting. No folder named. `.apm` edit silent. Same dialog from Skills → code-review pane → `Actions for Claude Code` → `Remove from Claude Code and Codex` (two-tool-05-remove-4, -5; cancelled). |
| 6a | Import local edits, copies differ | Edit `.claude/…/code-review/SKILL.md` and `.agents/…` with different lines → `Re-read Deploy-state` → Claude Code row ⋮ → `Import local edits` | Rows `Local edits` (both). Hover (both): `1 skill has changes that are not in the latest release: code-review. Select Import local edits to keep them.` Row ⋮: `Import local edits`, `Deploy skill`. Dialog `Import local edits from Claude Code and Codex`; `✕ Cannot be imported · 1`; `code-review` (checkbox disabled); `The Claude Code and Codex copies differ. Select Import skill on the Harness screen and choose one: ~/.claude/skills/code-review or ~/.agents/skills/code-review.`; button `Import skills` (blocked). | Opening the dialog: none. Cancelled. | two-tool-06-import-differ-1…5 | Hover card and pane promise import; the dialog refuses. Deploy-state never says the two copies differ. (#1768 confusion 3 confirmed.) |
| 6b | Import local edits, copies identical | Copy the Claude edit over the `.agents` copy → re-read → row ⋮ → `Import local edits` | Dialog `Import local edits from Claude Code and Codex`; `Can be imported · 1`; `code-review`; buttons `Cancel`, `Import 1 skill`. After: the cockpit switches to **Harness**: `Pending proposal 1`, `code-review` `Not yet proposed` `Changed`; pane `Your local copy differs from the next release. Select Propose change to send it for review. Or select Discard change to match the next release.` / `Deployed copies change only after a release and Update target.` | Home: nothing changed (`.claude`, `.agents`, `.apm` untouched). Harness clone `Projects/maestro-fixture-harness/.apm/skills/code-review/SKILL.md` modified, uncommitted. | two-tool-06-import-identical-1…5 | The dialog does not say where the import writes (the Harness clone) or that deployed copies stay. After import, Deploy-state still shows `Local edits` with `Select Import local edits to keep them.` |

## One-tool machine (Claude Code only)

| # | Action | Where triggered | Screen text before acting | Disk change (per folder) | Screenshots | Mismatch / silence |
|---|---|---|---|---|---|---|
| 0 | Baseline | Deploy-state | `Global 1` → `Claude Code` `Empty` `—` `—`; hover `Empty` | — | one-tool-00 | — |
| 1 | Deploy code-review to Global | Skills → row ⋮ → `Deploy skill` | Options `Global (Claude Code)`, `…/scenarios/empty`; `To deploy · 1` `code-review`; Report `Deployed 1 of 1 skill to Global` / `code-review v1.1.0` | `.claude/skills/code-review/SKILL.md` created. `.agents/` untouched (stays empty). `.apm/apm.yml` (targets `[claude]`), lockfile created; `apm_modules/` with all three skills + three prompts created. | one-tool-01-row-deploy-0…5 | No folder named. `.apm/` + full Harness copy silent. |
| 2 | Deploy commit-message + release-notes | Skills → selection bar `Deploy skills` | `Global (Claude Code)`; `To deploy · 2`; Report `Deployed 2 of 2 skills to Global` | `.claude/skills/{commit-message,release-notes}` created. `.apm/apm.yml` + lockfile modified. `.agents/` untouched. | one-tool-02-bulk-deploy-1…4 | Same as #1. |
| 3 | Read Global group | Deploy-state | In sync: `Claude Code` `In sync` `v1.1.0` `3`; hover `On the latest release.`; pane `Target Global`, `Folder path ~/.claude/skills`; ⋮ `Deploy skill`. Behind: `Behind` `v1.1.0 → v2.0.0`; hover `2 of 3 deployed skills changed in v2.0.0. Select Update target to move this target to v2.0.0.`; ⋮ `Deploy skill`, `Update target`. | none | one-tool-03-deploy-state-1…5 | Group header silent on what Global is; folder only in pane. |
| 4 | Update target | Row ⋮ → `Update target` | Dialog `Update Claude Code`; `release v1.1.0 → v2.0.0`; `Updates 1 skill, removes 1, leaves 1 unchanged.`; Changed code-review; Removed release-notes; Unchanged (1) commit-message; New (1) · not added test-plan; button `Update target`. Report `Updated 2` code-review, commit-message; `Removed 1` release-notes. | `.claude/skills/code-review` modified; `.claude/skills/release-notes` deleted; commit-message untouched. `.apm/apm.yml` + lockfile modified; `apm_modules/`: pin + code-review modified, release-notes deleted, test-plan created. `.agents/` untouched. | one-tool-04-update-1…3 | Report lists commit-message as `Updated`; disk unchanged. test-plan in `apm_modules` silent. |
| 5 | Remove commit-message | Claude Code pane → sub-row ⋮ → `Remove skill` | `Remove commit-message v2.0.0`; `Removes the skill from:` `Claude Code`; `The Harness keeps the skill. To add it back, select Deploy skill.` | `.claude/skills/commit-message` deleted. `.apm/apm.yml` + lockfile modified. `apm_modules` kept. | one-tool-05-remove-1…3 | No folder named; `.apm` edit silent. |
| 6a | Import local edits, one copy | Edit `.claude/skills/code-review/SKILL.md` → re-read → ⋮ `Import local edits` | Row `Local edits`; hover `1 skill has changes that are not in the latest release: code-review. Select Import local edits to keep them.`; dialog `Import local edits from Claude Code` / `Can be imported · 1` / `code-review` / `Import 1 skill`. | Home untouched. Harness clone `.apm/skills/code-review/SKILL.md` modified. Cockpit switches to Harness. Deploy-state afterwards still `Local edits` + same hover. | one-tool-06-import-single-1…5 | Same silences as two-tool 6b. |
| 6b | Stray differing copy in `.agents` | Hand-made `.agents/skills/code-review/SKILL.md` (different from both release and `.claude` copy) → re-read → ⋮ `Import local edits` | Dialog unchanged: `Import local edits from Claude Code` / `Can be imported · 1`. Cancelled; stray copy deleted. | none from the cockpit | one-tool-06-import-stray-agents-copy-dialog | Copy in an undetected tool's folder is ignored, without a word. |

"Edit both folders" (two-tool 6a/6b) does not apply on one-tool: Maestro deploys no `.agents` copy there. 6b is the nearest case.

## Raw mismatches and silences

1. **Choice point names tools, not folders.** Picker `Global (Claude Code + Codex)` / `Global (Claude Code)`, `To deploy` list and Report `Deployed N of N skill(s) to Global` never name a folder. Disk: `~/.claude/skills/<name>` and, for Codex, `~/.agents/skills/<name>` (not `~/.codex`). Evidence: two-tool #1–2, one-tool #1–2. Confirms #1768 confusion 1.
2. **`~/.apm` writes are invisible.** Every deploy, update and remove edits `~/.apm/apm.yml` and `~/.apm/apm.lock.yaml`; the first deploy creates `.apm-lifecycle.lock` and `apm_modules/`. No screen mentions `~/.apm`. Evidence: every action's diff.
3. **The whole Harness release lands in `~/.apm/apm_modules`.** Deploying one skill wrote all three skills plus `.maestro/prompts/*.md` there. Update added `test-plan` there while the dialog said `New in this release (1) · not added`. Remove left commit-message's source there. Evidence: two-tool #1, #4, #5; one-tool #1, #4, #5.
4. **Per-tool rows, all-tool actions.** Global shows one row per tool with its own Status, Release, Skills, hover card and pane, but Update and Remove change both folders. Hover and pane on a per-tool row: `Select Update targets to move this target to v2.0.0.` Evidence: two-tool #3b, #4, #5. Confirms #1768 confusion 2. Partly mitigated: before acting, the Update dialog title (`Update Claude Code and Codex`), the Remove dialog (`Removes the skill from: Claude Code, Codex`) and the Skills pane item (`Remove from Claude Code and Codex`) do name both tools.
5. **Singular/plural drift on Update.** Two-tool: row ⋮ and pane button `Update targets`, dialog title `Update Claude Code and Codex`, confirm button `Update target`, card text "this target". One-tool: `Update target` throughout. Evidence: two-tool #3b, #4; one-tool #3, #4.
6. **Global's target count differs by screen.** Deploy-state band `Targets 3` (2 Global rows + 1 repo); Skills pane `Targets 2` / `Deployed to 2`; dialogs and Report say "Global" or `Update target`. GLOSSARY **Target** says Global resolves to one target per tool; the dialogs treat it as one. Evidence: two-tool #2 (two-tool-02-bulk-deploy-1-bar), #3a, #4.
7. **Update Report contradicts its dialog and the disk.** Dialog: `leaves 1 unchanged` / `Unchanged (1) commit-message`. Report: `Updated 2` incl. `commit-message v2.0.0`. Disk: commit-message copies byte-identical before and after. Both machines. Evidence: two-tool #4, one-tool #4.
8. **Import local edits promised, then refused.** With differing copies, both Global rows' hover cards and the pane say `Select Import local edits to keep them.`; the dialog refuses with `Cannot be imported` and points to Import skill on the Harness screen. Deploy-state never says the copies differ. Confirms #1768 confusion 3. Evidence: two-tool #6a.
9. **Import local edits does not say where it writes.** Dialog shows only `Can be imported · 1` `code-review` / `Import 1 skill`. It writes the Harness clone's `.apm/skills/<name>/SKILL.md` (uncommitted), leaves every deployed copy, and switches to the Harness screen. Evidence: two-tool #6b, one-tool #6a.
10. **Local edits persists after import.** After a successful import, Deploy-state still shows `Local edits` and `Select Import local edits to keep them.`; nothing says the edit now waits on Propose change → release → Update target (only the Harness pane says `Deployed copies change only after a release and Update target.`). Evidence: two-tool-06-import-identical-4, -5; one-tool-06-import-single-5.
11. **Global itself is never explained.** Group header `Global 2` / `Global 1` carries a count only. The only folder on Deploy-state is the pane's `Folder path` fact (`~/.claude/skills`, `~/.agents/skills`), visible after opening a row. Evidence: two-tool #3a, one-tool #3.
12. **Undetected tool's folder ignored silently.** One-tool: a differing copy in `~/.agents/skills/code-review` changed nothing on screen; Import offered the Claude copy. Evidence: one-tool #6b.
13. **Remove from one row removes everywhere.** The Remove item sits in the Claude Code pane's sub-list, yet removes Codex's copy too; the dialog lists both tools. Evidence: two-tool #5.
14. Observation, not a Global mismatch: right after a `Re-read Deploy-state`, the Claude Code row ⋮ once listed only `Deploy skill`; a second re-read brought back `Import local edits`. One occurrence (one-tool #6a).

## Not reached

- **A tool installed after the first global deploy** (#1284) and **two-tool → one-tool with copies already deployed**: out of this ticket's six actions; not run.
- **Update with a local edit in the copy** (guarded refusal) and **Remove with a diverged copy**: not run; the ticket's actions were run on clean copies.
- **Dark theme, narrow width, 200% zoom**: not taken; light theme at 1440×900 only, as briefed.
- The Deploy-state pane foot `⋯` menu: covered by the Agentation toolbar during the run; its items were not captured.
- The first, failed two-tool deploy (`Harness copy unreleased`): caused by the walkthrough's own release rollback; screenshot overwritten by the retry.

## Prediction test

Fresh Sonnet sub-agents, briefed as a developer who knows git and a terminal but not APM, saw only screenshots (no hover) and predicted each action's disk effect. Set A: 10 questions written by the walkthrough's author, key fixed before any answer was read. Set B: 6 held-out questions per machine, written and keyed by an independent agent that saw only this note; the mock was specified before any Set B answer was read. An independent agent scored every run against the keys. Questions, keys and answers: `~/Pictures/maestro/1770-heldout/`.

| Set | Machine | Current screens | Mock |
|---|---|---|---|
| A (/10) | one-tool | 9 | **10** |
| A (/10) | two-tool | 3 | **9** |
| B (/6) | one-tool | 2 | 4 |
| B (/6) | two-tool | 3 | 6 |

Pass criterion (≥ 9/10 on both machines, Set A): met. Misses left on the mock:

- **Differing copies** (A-Q8 two-tool): the `Differing copies` badge alone does not tell the reader that Import local edits will refuse; the row menu still offers it. The menu belongs to "Local edits that differ between global folders".
- **`not added` vs `~/.apm`** (B-Q9 one-tool): the Update dialog's `New in this release · not added` stays silent that the new skill lands in `~/.apm`. Copy-reviewer flagged the same gap.
- **Next step after import** (B-Q12 one-tool): `Deployed copies change only after a release and Update target` skips Propose change.

Limits: sub-agents stand in for users; one predictor per run; Sonnet in every run so the scores compare; predictors read screens across questions, which may lift a baseline. A session with a teammate stays the real test (#1768).

## Findings and proposals

The mock text, after the adversarial and copy-review passes. Folder strings come from `core` (each tool's resolved skills folder), never from `web`: today `packages/web/src/deploy-state/tool-presentation.ts:12-13` hardcodes them, which breaks under `CLAUDE_CONFIG_DIR` (#1551) and on Windows.

| # | Finding | Proposal (mock text) | Status |
|---|---|---|---|
| F1 | Picker names tools, not folders (mismatch 1) | Option `Global (Claude Code + Codex)`, second line `~/.claude/skills and ~/.agents/skills, for every repository` | Proposed |
| F2 | Deploy never says what it writes (1–3) | Block `Writes to`: one line per folder, plus `~/.apm: a copy of the whole release, and the deployment record`. Report: `Deployed N of N skills to <folders>` | Proposed |
| F4 | Per-tool rows, all-tool actions; Global never explained (4, 11, 13) | Group line `Claude Code and Codex load these skills in every repository`; each tool row shows its folder inline. Where Update and Remove live → "Is Global one Target or one per tool?" and the prototype ticket | Proposed; placement handed on |
| F5 | `Update target(s)` drift (5) | Confirm button matches menu and pane: `Update targets` when Global spans two tools | Proposed |
| F6 | Update dialog names no folder | Line `Changes <folders>, and the deployment record in ~/.apm.` One skill list, not one per folder | Proposed |
| F7 | Report lists an unchanged skill under `Updated` (7) | Groups `Changed`, `Removed`, `Unchanged` (release in the row detail). Whether `Updated` meant "now at v2.0.0" is unverified | Proposed |
| F8 | Remove names tools, not folders (13) | `Removes <folder>/<skill> and …, and changes the deployment record in ~/.apm. The Harness keeps the skill. To add it back, select Deploy skill.` | Proposed |
| F9 | Differing copies: hover promises Import, dialog refuses (8) | Badge `Differing copies`; pane reuses the shipped `The Claude Code and Codex copies differ. Select Import skill …` sentence. Row menu → "Local edits that differ between global folders" | Proposed; menu handed on; still a miss in the re-test |
| F10 | Import never says where it writes (9) | `Copies the edits into the Harness clone as uncommitted changes, then opens the Harness screen. Deployed copies change only after a release and Update target.` | Proposed; add Propose change |
| F11 | `Local edits` persists after import (10) | Badge `Imported, not released` when the deployed copy equals the Harness clone's file, derived from disk, no stored state | Proposed; needs a GLOSSARY entry |
| F13 | One-tool: a copy in an undetected tool's folder is ignored (12) | No change. Cursor/OpenCode still load such a copy → map fog item on double loading | Out of this ticket |

Dropped: a separate `apm_modules` explanation (F3, covered by F2's line) and a Global header that defines the term (F12, F1 and F4 carry it).

## Adversarial pass (contrarian)

| Objection | Answer |
|---|---|
| The reader needs the folders and "every repository", not the word Global | Accepted: F1/F2 do the work; F12 dropped |
| Folder strings are hardcoded in `web`; wrong under `CLAUDE_CONFIG_DIR` and on Windows | Accepted: folders come from `core` (verified at `tool-presentation.ts:12-13`) |
| "All tools" means detected tools; an undetected tool's folder keeps the old release (#1774) | Accepted: every sentence names the detected tools' folders only; #1774 tracks the gap |
| `(Codex)` next to `~/.agents/skills` implies one reader; Cursor, OpenCode and others read it too | Accepted: tool names stay on the label, folders on their own line |
| F2 omits `apm_modules`, a consent prompt for outside copies, and a failed deploy | Partly: `a copy of the whole release` covers `apm_modules`; the Report states what happened, not the plan; consent and failure notices stay map fog |
| F4, F9, F11 hide decisions for other tickets | Accepted: placement, row menu and any stored state are handed to those tickets |
| F6 per-folder lists repeat the same list | Accepted: one list plus the folder line |
| F7 may not be a defect | Accepted: treated as copy; meaning unverified |
| F11 "Imported" is not a disk state | Accepted: derived from comparing the deployed copy with the Harness clone |
