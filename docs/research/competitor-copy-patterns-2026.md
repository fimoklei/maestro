# What the leading agent tools do in their copy, and what Maestro should take

Read **2026-10-04**. Purpose: find the copy patterns the five market leaders
in agentic developer tools share and five smaller tools lack, turn them into
`copy.md` amendments, and propose a rewrite of the cockpit's copy with one
idea per screen. The amendments in §3 and the rewrite in §4 are the only parts
that ask for a decision. Nothing here was applied to `copy.md` or the code.
Companion to [agent-ui-copy-harnesses-2026](agent-ui-copy-harnesses-2026.md)
and [copy-anchors-govuk-polaris](copy-anchors-govuk-polaris.md).

## 1. Method

Only the screens that manage an agent setup were read: skills, rules, hooks,
MCP servers, plugins, permissions and their errors. These are the closest
match to Maestro.

| Group | Product | Source |
|---|---|---|
| Leader | GitHub Copilot (VS Code) | `microsoft/vscode` `localize()` strings at `5e86c7c4`, Agent Customizations editor and MCP; docs.github.com |
| Leader | Claude Code | Installed binary 2.1.289 (`strings`), code.claude.com docs |
| Leader | OpenAI Codex | `openai/codex` at `afb436df`, TUI strings and snapshots |
| Leader | Cursor | Installed app 3.18.25, workbench bundle; cursor.com/docs |
| Leader | Windsurf, now Devin Desktop | Build 3.10.48 bundles (2026-09-29); docs.devin.ai. Windsurf was renamed on 2026-06-02 |
| Contrast | Cline | `cline/cline` at `39ff235`, webview strings |
| Contrast | Continue | `continuedev/continue` at `5522c6f` (no commits since 2026-07-20) |
| Contrast | Kiro, Augment Code, Tabnine | Docs only; wording **[unverified as live UI]** |

A string found in a bundle exists in code; a feature flag may still hide it.
Counts are from samples unless marked otherwise. **[inferred]** marks a
reading, not a source's statement.

## 2. What the leaders do that the contrast set does not

**1. Problems roll up into one line with a count; the list sits in one place.**
- Leaders: Copilot's `Needs Attention` group; Claude Code's `Needs attention`
  section and Errors tab; Codex's `⚠ 1 hook needs review before it can run.`
  plus an Issues panel; Cursor's `Needs Attention` filter and
  `Configuration Errors` section.
- Contrast: Cline appends every MCP stderr line that contains "error" to the
  server card. Continue stacks a red alert per failure.

**2. An error names the cause and one next step; raw output never reaches the screen.**
- Leaders: Claude Code maps each plugin error type to one fix line (`Add the
  marketplace first using /plugin marketplace add`). Copilot's newer code
  does the same (`A skill already exists at '{0}'. Remove or rename it before
  installing this resource.`); its older MCP code still ends 43 of about 140
  failure strings in a raw `{1}`. Cursor and Devin do it for connection
  errors (`Server not found. Check the URL.`).
- Contrast: Cline and Continue show `err.message`, stderr or a stack in the
  UI. Continue's crash page reads `Oops! Something went wrong` above the raw
  error, and its `Continue` button wipes local state.

**3. A destructive dialog repeats its verb on the button and states what changes, then what stays.**
- Leaders: `Remove marketplace?` → `Remove` with `The source repository won't
  be affected.` (Cursor); `Stops offering {name} here. Anyone who already
  installed it keeps it.` (Devin); `Delete MCP server '{0}'?` → `Delete`
  (Copilot). Newer leader code has dropped `Are you sure…`; it survives only
  in older Copilot and Cursor templates.
- Contrast: Cline deletes servers, rules and hooks on a single press with no
  dialog. Continue titles `Delete {doc}`, asks to `remove` it in the body and
  confirms with `Confirm`.

**4. Every option names its reach in words.**
- Leaders: `Install in Workspace`, `Allow in this Session` (Copilot);
  `Install for you, in this repo only (local scope)` (Claude Code);
  `Yes, grant these permissions for this session` (Codex); `Devin loads this
  MCP for everyone in this org.` (Devin).
- Contrast: Augment's `Auto` means one thing for rules and another for
  skills. Continue's tool policy and approval buttons use different words for
  the same choice.

**5. One thing has one name, and a sentence points at a control that exists.**
- Leaders slip rarely: Claude Code's empty state still says `Use the Browse
  tab` after the tab became `Discover`.
- Contrast: this is the most common weakness. Kiro names one place `Steering
  section`, `Agent Steering & Skills section` and `Agent Steering
  configuration`. Augment writes `Rules and User Guidelines` and `User
  Guidelines and Rules` on one page. Tabnine calls the same tools `Run
  Command` in the IDE and `Run` in the admin console.

**6. Setup screens carry no hype, no exclamation marks and no chat register.**
- Leaders: zero hits for seamless, supercharge, effortless, leverage, magic
  or AI-powered in the setup screens of all five. The few leaks sit in
  onboarding, model pickers and marketing (`Supercharge your workflow with
  Devin`, `Expand your agent's horizons`).
- Contrast: `Whoops looks like you're logged out`, `Let's go!`, `Success!`
  (Cline); `Oops! Something went wrong`, `AI-powered coding` (Continue);
  `Enhance Prompt ✨` (Augment); `Let's build` (Kiro).

**7. Sentences are short.** Copilot's setup strings have a median of 8 words
and a 90th percentile of 13. Cursor and Devin descriptions run 8–20 words.
Continue's rebuild-index dialog body carries four ideas, including a keyboard
workaround. Cline's MCP intro carries three links.

## 3. Proposed amendments to `copy.md`

Maestro already holds patterns 2, 3 and 6 in its rules: outcome-first
notices, the Dialog form, the ban on `apm` and `gh` prose in a response, and
clean register (one hit, `just now`). Pattern 5 is in the rules, but the
cockpit breaks it in six places (§5). The amendments cover the rest.

**Under `## Patterns`, add:**

```markdown
- Show one notice per band. Merge notices that share an action into one
  and list the parts in `detail`. Where notices need different actions,
  show the one that blocks most; it replaces the others until it clears.
- A success outcome is a toast, never a band notice.
- A hover card holds the status reason in one sentence and the read age.
  Put actions and lists in the detail pane.
- A control that acts beyond the selected row names its reach in the
  label: `Remove from all 3 targets`, `Remove from Claude Code and Codex`.
- A dialog body states what changes, then what stays. It never asks
  `Are you sure`.
- Build every `Select {control}` sentence from the control's label
  constant. Name the screen when the control is on another screen. Never
  point by position (`above`, `below`).
```

**Under `## Sentences (ASD-STE100)`, replace the length line with:**

```markdown
- Aim for 12 words or fewer. Never write more than 20.
- Give each sentence one idea. A text block holds at most the outcome and
  one next action; the cause goes in `detail`.
```

**Add a `## Register` section:**

```markdown
- No exclamation marks, emoji, apologies or chat phrases (`Oops`,
  `Let's`, `Sorry`). The status glyphs ✓ ⚠ ✕ are not emoji.
- No promotional words. `scripts/copy-guard.mjs` lists them.
```

**Add to `RETIRED` in `scripts/copy-guard.mjs`:**

```js
/\b(?:seamless(?:ly)?|effortless(?:ly)?|supercharge\w*|powerful|magic(?:al)?|unlock\w*|leverage\w*|AI-powered|intelligent(?:ly)?|smartly|empower\w*|robust|Oops|Whoops|Let's)\b/i,
/!(?:\s|$)/,
```

Each word is wrong in every screen use, as `copy.md` requires. `just` stays
with review, because `Read just now` is correct.

## 4. Rewrite: one idea per screen

Each screen answers one question. A string not listed already serves that
question and passes the rules; it stays as it is. Each row names the rule or
pattern it applies.

### Connect gate — *Connect a Harness.*

| Where | Now | Proposed | Rule |
|---|---|---|---|
| `welcome-view.tsx:12` | Inventory not connected | No Harness connected | One name; reuses `inventory-panel.tsx:23` |
| `welcome-view.tsx:15` | Maestro reads skills, hooks and MCP servers from a Harness clone or GitHub repository. The cockpit stays empty until one is connected. | Connect a Harness to see its skills, hooks and MCP servers. | One idea |
| `welcome-view.tsx:23`, `connect-form.tsx:156` | Connect Inventory | Connect Harness | One name |
| `connect-view.tsx:34` | Inventory connection | Connect a Harness | Dialog form `{Verb} a {thing}` |
| `connect-view.tsx:37` | A private Harness works only when every teammate has their own GitHub and APM access. | *(move to the `joined` success detail)* Teammates need their own GitHub and APM access to a private Harness. | One idea per screen |
| `connect-form.tsx:10` | Inventory path or GitHub URL | Harness folder or GitHub URL | One name |
| `connect-form.tsx:13` | The Harness is cloned into a new folder here, named after the repository. Nothing already in this folder is renamed, moved or deleted. | Maestro adds one new folder here and changes nothing else. | ≤ 12 words; the preview line already names the folder |
| `connect-form.tsx:144` | Connecting. A GitHub URL is cloned first, which can take a minute. | *(shown for a URL only)* Cloning can take a minute. | One idea |
| `connect-success-view.tsx:30` | `{n} primitives found` / Deploys never write back to this Harness. | Harness connected / `{n} items are ready in the Inventory.` | Retired word *primitive*; one heading for both success paths |
| `connect-success-view.tsx:47` | Harness created. It has no skills yet. / Skill checks do not block releases unless the team makes them required. | Harness created / It has no skills yet. | Drop the unrelated second idea |

### Shell — *Where am I, and what needs me?*

| Where | Now | Proposed | Rule |
|---|---|---|---|
| `use-sidebar-counters.ts:68` | `3` | `3 pending` | Same form as `2 behind` beside it |

### Inventory — *Is each released skill up to date where it is deployed?*

| Where | Now | Proposed | Rule |
|---|---|---|---|
| `inventory-view.tsx:255` | Read failure and *No released skills* can stack | The read failure replaces the empty notice | One notice per band |
| `inventory-panel.tsx:23` | No Harness connected / Connect a Harness on the Harness location screen to fill this list. / Nothing is connected yet. | No Harness connected / Select Change Harness location in Settings. | Reuse `harness/notice-copy.ts`; drop the detail that repeats the heading |
| `inventory-copy.ts:18` | No released skills / Inventory shows skills from the latest release. Open Harness, then create a release to add skills. | No released skills yet / Skills from the latest release appear here. + **Open Harness** | Empty-state form |
| `inventory-copy.ts:73` | `{more} more. Select the row to see all {total} targets.` | `And {more} more.` | Hover card: no action |
| `bulk-deploy-report-view.ts:40` | `Deployed to {target} · {n} failed · {n} attention · {n} deployed · {n} skipped` | `Deployed {n} of {m} skills to {target}` | One idea; the groups carry the counts |
| `bulk-remove-report-view.ts:44` | apm.yml holds an unexpected shape | Manifest not recognised | One name (`GLOSSARY.md`) |
| `bulk-remove-report-view.ts:44` | What it would delete was never confirmed | Removal not confirmed | ≤ 5 words, concrete |

### Deploy-state — *Which targets need action?*

| Where | Now | Proposed | Rule |
|---|---|---|---|
| `deploy-state-copy.ts:25–39` | Global targets not read / Registered repositories not read / Deploy-state not read, each its own notice | Deploy-state not read / Select Re-read Deploy-state to read every target again. / detail: `Not read: {global targets, registered repositories}.` | Merge notices that share an action |
| `deploy-state-copy.ts:49` | No supported tool detected, a band notice | The **Global** group's empty row: Install Claude Code or Codex to deploy skills globally. | One notice per band; the fact sits where it applies |
| `deploy-state-copy.ts:12` | Nothing deployed — deploy a skill from Inventory | Nothing deployed yet | Group meta is a fact; the action lives in the empty state |
| `deploy-state-copy.ts:19` | No repositories registered. Select Register repository on the Repositories screen to register one. | No repositories registered yet. Select Register repository on the Repositories screen. | Drop the restated purpose |
| `target-rows.ts:231` | Status hover card, up to ten lines | One reason sentence + read age, for example `2 of 5 deployed skills changed in v1.4.0.` / `Read 4 min ago`. Everything else moves to the pane | Hover card rule |
| `release-head-copy.ts:128` | Files changed after deployment. The latest release lacks these changes. Select Import local edits to bring them into the Harness. | Files changed after deployment. | Hover card: one idea, no action |
| `release-head-copy.ts:132` | This copy could not be verified against a recorded baseline | The deployment record cannot check this copy. | `GLOSSARY.md` wording; *baseline* is jargon |
| `deploy-state-copy.ts:68` | Could not reach the Harness location to check for updates | Update check did not run. Maestro could not reach the Harness. | The `?` marker's name in `GLOSSARY.md` |
| `deploy-state-copy.ts:66` | This deployed skill is absent from the latest release | Not in the latest release. | Short form of **No longer released** |
| `skipped-entry-text.ts:9` | … Fix the skill in the Harness, publish a release, then deploy again. | … Fix the skill in the Harness, select Create a release, then deploy again. | Exact control label |
| `update-target-copy.ts:55` | Counting line *and* `Selected skills after this update: {names}.` | Counting line only | One idea; the sections already list the names |
| `notice-copy.ts:369` | The target changed since this update was priced. Nothing was changed, then select Update target again. | Nothing was changed. The target changed after the preview. Select Update target again. | Broken sentence; *priced* is jargon |
| `notice-copy.ts:253` | The copy on disk changed since this removal was priced. Check the new cost above, then remove the skill. | Nothing was removed. A copy changed after the check. Read the list again, then select Remove skill. | No position words; no *priced* |

### Harness — *Where is each change on its way to a release?*

| Where | Now | Proposed | Rule |
|---|---|---|---|
| `harness-view.tsx:471` | Five notice slots that can all show at once | One slot. Order: read failure, then status out of date, then clone sync | One notice per band |
| `notice-copy.ts:654` | Release published / `Maestro tagged {tag} and re-read Inventory.` / A release cannot change after publication. | Toast: `Published {tag}.` | Success outcome is a toast |
| `notice-copy.ts:718` | Skill restored / Restored from your last local commit. / Your proposal remains unchanged. | Toast: `Restored {skill}.` | Success outcome is a toast |
| `stage-copy.ts:112` | … Select Propose change to propose the deletion, or Restore skill to bring it back. | … Select Propose change to propose the deletion. | One next action; **Restore skill** stays in the menu |
| `deletion-dialog.tsx:50` | You deleted {skill} from the Harness working tree. Confirming proposes that deletion to {origin} on its own branch. Nobody loses the skill until the pull request is merged. | Delete skill proposes this deletion to {origin} for review. Your targets keep the skill until you update them. | What changes, then what stays |
| `deletion-dialog.tsx:61` | {skill} is in the Harness working tree and nowhere else. Confirming removes the folder from disk for good. | Delete skill removes the folder from disk. No other copy of {skill} exists. | What changes, then what is left |
| `restore-dialog.tsx:48` | Restore this skill folder from your last local commit. Changes not included in that commit will not be recovered. Your proposal remains unchanged. | Restore skill brings back the folder from your last local commit. Later changes do not come back. | Two ideas at most; the facts show the proposal |
| `import-dialog.tsx:84` | Import copies this folder to the Working Harness. The original folder stays unchanged. | Import copies the folder and leaves the original as it is. | One sentence; *Working Harness* appears nowhere else |
| `notice-copy.ts:112`, `:167`, `:246` | … Select Re-read Harness to repaint the list. | … Select Re-read Harness to read the list again. | *repaint* is implementation talk |
| `notice-copy.ts:458` | This skill has uncommitted changes in the Harness. Commit or undo them, then Update skill again. | Nothing was copied. Commit or undo them in your Git tool, then select Update skill again. | The message repeated the heading |
| `stage-copy.ts:231` | Deployed copies still have the earlier version. They get this version after a release and a new deploy. | Deployed copies change only after a release and Update target. | One sentence; exact control |

### Repositories — *Which repositories does Maestro deploy to?*

| Where | Now | Proposed | Rule |
|---|---|---|---|
| `repositories-copy.ts:94` | Registering changes no files. Files change only when you deploy. | Registering changes no files. | The second sentence restates the first |
| `repositories-copy.ts:51` | This is the Harness, not a valid target. Register a repository. | This folder is the Harness. Choose a repository you deploy to. | Concrete; no *valid* |
| `repositories-copy.ts:52` | Not a Git repository. Register a valid repository. | Not a Git repository. Choose a folder that holds one. | Concrete; no *valid* |
| `repositories-copy.ts:59` | Maestro could not register this repository. Try registering it again. | Nothing was registered. Select Register repository again. | Outcome first; exact label |
| `repositories-copy.ts:80` | Repository not unregistered / It is no longer on the list. … | Repository already unregistered / Select Re-read Repositories to read the list again. | The heading contradicted what happened |

### Settings — *Which Harness is connected, and how does the cockpit look?*

No change. Both pages hold one idea.

## 5. Defects found on the way

These break rules that already exist. They can ship without the amendments.

- **Pointers to controls that do not exist.**
  - `notice-copy.ts:107`: `Select Connect Inventory on the Inventory screen`. Proposed: `Select Change Harness location in Settings, then deploy again.`
  - `notice-copy.ts:335`: `Connect a Harness on the Inventory screen`. Proposed: `Select Change Harness location in Settings, then select Update target again.`
  - `notice-copy.ts:124`, `:129`: `Select Publish release on the Harness screen`. The Harness screen's button is **Create a release**.
  - `import-local-edits-copy.ts:81`: `Check the target card`. The card is now a pane. Proposed: `Open the target on the Deploy-state screen and finish that change, then select Import local edits again.`
- **Retired word on screen.** `primitive-count-label.ts:3` shows *primitive(s)*.
  `copy-guard` misses it because it skips one-word lowercase literals as
  codes (`copy-guard.mjs`, the `/\s|^[A-Z]/` filter).
- **Two names on one screen.** The connect gate says *Inventory* and *Harness* for the same thing (§4).
