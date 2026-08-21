# The string inventory: every word the cockpit shows

Resolves [#648](https://github.com/fimoklei/maestro/issues/648) on the map
[what the cockpit says to the person reading it](https://github.com/fimoklei/maestro/issues/646).
This file counts; it fixes nothing.

Measured at `c6d693d` (2026-08-21).

## The count

**656 user-facing string sites.**

A *site* is one place in the code where copy is authored — one row in the tables
below. A handful of sites render one of two or three alternates behind a
ternary (`close` / `cancel`); those are one site, listed together.

| Where it lives | Sites | Share |
|---|---:|---:|
| A copy module (`*/notice-copy.ts`, `connect-notice.ts`, `browse-notice.ts`, `notice-table.ts`) | 121 | 18% |
| A view-model or presentation table beside its component (`*-view.ts`, `*-view-model.ts`, `tool-presentation.ts`, `browse-modes.tsx`, …) | 103 | 16% |
| Inline in a component | 302 | 46% |
| Authored in `packages/server/src/app.ts` (the sentence half; ADR-0018) | 130 | 20% |

Only the first row is what the map's Notes mean by "copy centralises per feature".
**The other 535 sites — 82% — are not in a copy module.** The second row is the
near-miss: already lifted out of JSX, already unit-testable, but scattered
across 20 files under 20 different names.

### The largest surfaces

| Rank | Surface | Sites |
|---:|---|---:|
| 1 | `error/notice` | 299 |
| 2 | `status line or badge` | 74 |
| 3 | `heading or nav label` | 60 |
| 4 | `button or action label` | 50 |
| 5 | `screen-reader-only or aria label` | 40 |

`error/notice` alone is 46% of everything the cockpit says. 121 of those are
Notice headings owned by `web`, 130 are sentences owned by `server`, and 48 are
written inline in a component.

## Method and scope

- Read: every non-test, non-story `.ts`/`.tsx` under `packages/web/src` (129
  files, 10,793 lines), plus `packages/web/index.html`, plus every
  `message:` string in `packages/server/src/app.ts`.
- Counted: one row per string literal, template literal, or JSX text node the
  user can read. A template literal counts once, however many values it
  interpolates. Where a row covers a family written as one table (`FAILURE_REASON`,
  `SOURCE_BLOCKER_TEXT`), the row names the family size and counts as one site.
- **`packages/core` authors no user-facing sentence.** Its only prose is the
  pull-request subjects in `harness-git.ts` (`"Promote skill: "`,
  `"Remove skill: "`), which land on GitHub, never on the cockpit screen.
  `packages/server/src/app.ts` is the sole non-web author.
- Excluded, per the ticket: test files, Storybook stories, terminal and dev
  output. Also excluded: CSS class names, query keys, API paths, `localStorage`
  keys, and `apm` tool tokens (`"claude"`, `"codex"`) — machine strings, not
  copy.

### Surfaces, as the code demanded them

The ticket's ten surfaces held, with two added and one narrowed:

- **Added — `screen-reader-only or aria label`.** 40 sites exist only for a
  screen reader (`sr-only` spans, `aria-label` on live regions and dialogs).
  They are copy nobody reviewing the screen can see, and they routinely
  contradict the visible word beside them. They cannot sit inside
  `heading or nav label` without hiding that.
- **Added — `request-shape message`.** 8 `"Expected a JSON body with…"`
  strings in `app.ts`. They reach the screen through the same Notice slot as
  every other sentence, but they describe an HTTP body, not a user action.
- **Narrowed — `warning`.** Kept for level-`warning` notices and for the
  cost/consequence lines a removal charges. Everything else that reads as a
  caution is an `error/notice`.

---

## error/notice — 299

### Notice headings, in a copy module (121)

`packages/web/src/deploy-state/notice-copy.ts` — module, 31

| Line | Text |
|---:|---|
| 29 | nothing was removed |
| 37 | only skills for now |
| 39 | the name is not a slug |
| 40 | skill not in the inventory |
| 43 | no harness connected |
| 45 | repo not registered |
| 48 | the harness has no GitHub origin |
| 50 | no published tag has it |
| 53 | the harness copy is unpublished |
| 57 | the deployed copy has local edits |
| 61 | local edits cannot be checked |
| 65 | the deployed copy cannot be read |
| 67 | the lockfile is unreadable |
| 70 | a deploy is already running |
| 72 | no supported tool detected |
| 73 | GitHub access is missing |
| 76 | the destination is a symlink |
| 80 | unmanageable package type |
| 84 | the deploy landed no files |
| 86 | the deploy is unproven |
| 87 | the deploy stopped part-way |
| 88 | nothing deployed here |
| 91 | the lockfile entry is unrecognisable |
| 96 | a change is already running |
| 98 | the removal failed |
| 99 | the check could not run |
| 100 | no path given |
| 101 | the path is not absolute |
| 102 | no directory at that path |
| 103 | the path is not a directory |
| 109 | the deploy did not run |

`packages/web/src/harness/notice-copy.ts` — module, 49

| Line | Text |
|---:|---|
| 21 | no Harness is connected |
| 24 | no GitHub origin |
| 30 | no answer from GitHub |
| 35 | no answer from GitHub |
| 36 | someone published first |
| 37 | the plan is stale |
| 38 | the tag was not pushed |
| 41 | a release is already running |
| 49 | the name is not a slug |
| 50 | no answer from GitHub |
| 51 | nothing left to promote |
| 52 | the clone pushes elsewhere |
| 53 | the folder changed mid-read |
| 54 | a teammate changed it |
| 55 | the push did not land |
| 58 | a promotion is already running |
| 62 | the confirmation is stale |
| 64 | the skill is still there |
| 67 | the clone is partial |
| 69 | a merge is unfinished |
| 70 | a rebase is unfinished |
| 73 | conflicts are unresolved |
| 75 | the working tree is unreadable |
| 85 | the folder cannot be read |
| 87 | folder out of reach |
| 88 | that is a deployed copy |
| 89 | no SKILL.md in it |
| 92 | the frontmatter does not parse |
| 94 | the description is empty |
| 95 | the name is not a slug |
| 96 | that name is taken |
| 97 | the folder is gone |
| 98 | not a folder |
| 99 | that name is taken |
| 100 | it holds a symbolic link |
| 101 | a file is shared elsewhere |
| 102 | it holds a special file |
| 103 | over 1,000 files |
| 104 | over 50 MiB |
| 105 | the folder changed mid-copy |
| 106 | the copy did not finish |
| 109 | the skills folder is outside |
| 114 | the Harness did not load |
| 117 | GitHub was not read |
| 120 | no plan to show |
| 123 | release not published |
| 126 | the skill was not promoted |
| 129 | removal not published |
| 132 | nothing imported |

`packages/web/src/inventory/connect-notice.ts` — module, 35

| Line | Text |
|---:|---|
| 13 | no path given |
| 14 | path is not absolute |
| 15 | no folder at that path |
| 16 | not a folder |
| 17 | not a GitHub URL |
| 20 | URL carries credentials |
| 22 | not a usable clone folder |
| 25 | destination folder is taken |
| 29 | half-finished clone in the way |
| 33 | that clone is already running |
| 35 | GitHub sign-in failed |
| 36 | repository not available |
| 37 | the clone did not finish |
| 38 | not a Harness |
| 40 | not a Harness yet |
| 41 | no usable git origin |
| 42 | no default branch |
| 46 | no path given |
| 47 | path is not absolute |
| 48 | no folder at that path |
| 49 | not a folder |
| 50 | the offer has expired |
| 51 | not a git repository |
| 52 | already a Harness |
| 53 | files already in the way |
| 54 | no default branch |
| 57 | not on the default branch |
| 59 | a scaffold is already running |
| 60 | nothing was written |
| 61 | the commit failed |
| 62 | GitHub refused the push |
| 63 | GitHub could not be reached |
| 64 | scaffolded but not connected |
| 71 | the connect failed |
| 75 | the scaffold failed |

`packages/web/src/shell/browse-notice.ts` — module, 5

| Line | Text |
|---:|---|
| 6 | outside the browsable area |
| 7 | no folder at that path |
| 8 | not a folder |
| 9 | folder could not be read |
| 13 | the folder did not load |

`packages/web/src/ui/notice-table.ts` — module, 1

| Line | Text |
|---:|---|
| 39 | The Maestro server did not answer that request. |

### Notice sentences authored in `server` (122)

All in `packages/server/src/app.ts`, inline in the route file. Each is the
sentence half of a Notice whose heading `web` owns (ADR-0018).

| Line | Text (opening clause) |
|---:|---|
| 213 | Hooks and MCP servers stay in the harness until Maestro can deploy them… |
| 217 | Lowercase letters, digits and hyphens only. Rename the skill… |
| 222 | The inventory holds no skill by this name… |
| 227 | Nothing can be deployed until Maestro knows where the harness lives… |
| 232 | Only a repo registered with Maestro can receive a deploy… |
| 237 | A deploy installs from GitHub tags, so the inventory clone needs… |
| 242 | A deploy installs from a published tag, and no tag holds this skill… |
| 247 | A deploy would install the published version, not what sits in the harness now… |
| 252 | Those edits never went through the harness… |
| 257 | This copy predates content tracking… |
| 262 | Its permissions or its shape blocked the check, so nothing was installed… |
| 267 | apm.lock.yaml is present but unparsable… |
| 272 | This target takes one change at a time. The deploy can start… |
| 279 | A global deploy installs into Claude Code or Codex… |
| 285 | GitHub refused the download, so nothing was installed… |
| 291 | apm refuses to install into a linked skill directory… |
| 298 | apm recorded a package type Maestro cannot manage as a skill… |
| 303 | apm reported success but recorded the package as invalid… |
| 308 | apm reported the install as done, but the target's lockfile… |
| 313 | apm stopped part-way, so the target may hold a partial install… |
| 322 | Hooks and MCP servers stay where they are until Maestro can remove them… |
| 326 | Lowercase letters, digits and hyphens only. Nothing was removed… |
| 331 | Only a repo registered with Maestro can be changed… |
| 337 | A global removal deletes from Claude Code or Codex… |
| 342 | This target holds no copy of the skill, so nothing was deleted… |
| 347 | apm.lock.yaml is present but unparsable, so Maestro cannot name what to remove… |
| 352 | Its reference does not point at this skill the way a Maestro deploy would… |
| 357 | Its permissions or its shape blocked the check, so Maestro cannot say… |
| 365 | The copy on disk is no longer the one this removal was priced against… |
| 370 | This target takes one change at a time. The removal can start… |
| 376 | apm ran but proved nothing, so the copy may be gone or may still be there… |
| 391 | Nothing can say yet what a removal would delete… |
| 425 | Nothing can be registered without one. Name the repository's absolute path. |
| 427 | Start at the filesystem root, for example /Users/name/code/my-repo. |
| 429 | Nothing exists there to register. Check the spelling… |
| 431 | It names a file, and only a repository folder can be registered… |
| 433 | The harness is where skills come from, not a target… |
| 455 | Type the path to a local Harness clone, or paste a GitHub repository URL. |
| 459 | Start it from the root, so it names the same folder wherever Maestro runs. |
| 464 | Nothing is there now. Check the spelling, or browse to it. |
| 468 | That path points at a file. Choose the folder that holds it. |
| 482 | Maestro clones a Harness from a GitHub repository over https or ssh… |
| 487 | Maestro never stores credentials, and git would write them into the clone… |
| 492 | Choose an existing folder inside the home area… |
| 497 | Maestro never renames or deletes what it finds… |
| 502 | An interrupted attempt left it behind… |
| 507 | The first attempt is still running. Wait for it to finish… |
| 514 | Maestro uses the local git credentials and never stores any of its own… |
| 519 | It may not exist, may be private, or the URL may be mistyped… |
| 525 | The cause is usually local: no disk space, no write access… |
| 530 | That folder has no apm.yml. Choose a folder that holds a Harness… |
| 537 | Maestro can scaffold the canonical empty Harness into that repository… |
| 542 | The folder holds a Harness, but its git origin is missing… |
| 547 | Maestro cannot tell which branch that Harness's origin treats as the default… |
| 559 | A Harness is scaffolded into a clone of a GitHub repository… |
| 564 | It already holds an apm.yml, so there is nothing to scaffold… |
| 569 | The scaffold would have overwritten files already in that repository… |
| 574 | Maestro cannot tell which branch that repository's origin treats as the default… |
| 579 | The scaffold's first commit belongs on the default branch… |
| 584 | Maestro only scaffolds a repository it has just offered to scaffold… |
| 589 | The first attempt is still running. Wait for it to finish… |
| 594 | Maestro removed the files it had already written… |
| 599 | The Harness files are in the clone, but git would not commit them… |
| 604 | The commit is safe in the clone. What is missing is push access… |
| 609 | The commit is safe in the clone. It reaches GitHub as soon as… |
| 614 | The Harness is in the repository and pushed, but Maestro could not connect it… |
| 624 | Nothing can be shown here until Maestro knows where the Harness lives… |
| 629 | Releases are published as tags, so the clone must fetch from GitHub… |
| 641 | A release plan is measured against what GitHub holds… |
| 653 | Nothing was published. Press refresh to read GitHub again… |
| 660 | That version number is taken. Maestro recomputed the plan… |
| 665 | GitHub moved while this dialog was open, so nothing was published… |
| 670 | The Harness is as it was. Check the connection to GitHub… |
| 675 | Only one release runs at a time. Wait for it to finish… |
| 688 | A skill name is lowercase letters, digits and single hyphens, like code-review. |
| 695 | Nothing was pushed. Press refresh to read GitHub again, then promote. |
| 700 | The skill is no longer in the Harness working tree… |
| 705 | Maestro publishes only to the origin it fetches from… |
| 710 | Nothing was pushed. Let the edit on disk finish, then promote again. |
| 715 | Nothing was pushed, so their version still stands… |
| 720 | The Harness is as it was. Check the connection to GitHub, then promote again. |
| 725 | Only one promotion runs at a time. Wait for it to finish… |
| 738 | Nothing was pushed. Press refresh to read GitHub again, then confirm the removal. |
| 743 | The copy on the default branch moved after this confirmation was given… |
| 748 | A removal publishes what the Harness working tree already says… |
| 753 | A missing folder in a partial clone is not proof of a deletion… |
| 758 | Nothing was pushed — a half-merged working tree does not state what should go… |
| 763 | Nothing was pushed — a half-rebased working tree does not state what should go… |
| 768 | Nothing was pushed — a conflicted working tree does not state what should go… |
| 773 | Nothing was pushed. Check that the Harness folder is still on disk… |
| 779 | Nothing was pushed. Press refresh to repaint the list, then decide again. |
| 784 | The Harness is as it was. Check the connection to GitHub, then confirm again. |
| 796 | Nothing can be imported until Maestro knows where the Harness lives… |
| 801 | Nothing was copied. Check that the folder is still on disk and readable… |
| 807 | Maestro reads inside the home folder only. Pick a folder under it. |
| 812 | Importing it would copy Maestro's own output back into the Harness… |
| 817 | Without one, the folder is not a skill Maestro can carry… |
| 822 | Maestro cannot read the skill's name or description… |
| 827 | The description is what tells an agent when to reach for the skill… |
| 832 | A skill name is lowercase letters, digits and single hyphens, like code-review. |
| 837 | The Harness already holds a skill under it. Pick another name. |
| 841 | Nothing was copied. Pick the folder again. |
| 845 | A skill is a folder with a SKILL.md in it. Pick one of those. |
| 849 | The Harness already holds a folder under it. Pick another name. |
| 853 | Maestro will not follow one into somewhere else on disk… |
| 858 | Copying it would tie the Harness to a file it does not own… |
| 863 | Maestro carries plain files and folders only… |
| 868 | Nothing was copied. A skill is a handful of files… |
| 873 | Nothing was copied. A skill is text — pick the skill folder itself… |
| 878 | Nothing was left in the Harness. Let the edit on disk finish… |
| 883 | Nothing was left in the Harness. Check that there is room on disk… |
| 888 | Writing there would land outside the Harness, so nothing was copied… |
| 898 | Maestro browses inside the home folder only. Pick one under it. |
| 902 | It may have been moved or deleted since the last look. Pick another folder. |
| 907 | That path points at a file. Pick the folder that holds it. |
| 912 | Its permissions do not allow reading. Pick another folder. |
| 966 | No inventory is configured. Set the Harness source path. |
| 1213 | A repo path is required. |
| 1221 | That repo is not registered with Maestro. |
| 1232 | The repo's lockfile could not be read. |
| 1248 | The global lockfile could not be read. |
| 1379 | That repo is not registered with Maestro. |

Line `1379` writes the same sentence as `1221` in a second route handler — two
sites, one string. It is the pattern the whole table repeats.

### Notice headings and sentences written inline in a component (48)

| File · line | Text | Where |
|---|---|---|
| `deploy-state/deploy-state-panel.tsx:49` | this repo's deploy-state could not be read | inline |
| `deploy-state/deploy-state-panel.tsx:50` | Reload the page to run the read again. | inline |
| `deploy-state/deploy-state-view.tsx:92` | the registered repos could not be loaded | inline |
| `deploy-state/deploy-state-view.tsx:93` | Reload the page to run the read again. | inline |
| `deploy-state/global-targets.tsx:53` | the global targets could not be read | inline |
| `deploy-state/global-targets.tsx:54` | Reload the page to run the read again. | inline |
| `deploy-state/deploy-state-list.tsx:74` | The removal could not be completed. | inline |
| `deploy-state/remove-skill-dialog.tsx:309` | can't be removed | inline |
| `deploy-state/remove-skill-dialog.tsx:345` | the removal failed | inline |
| `inventory/config-unreachable-notice.tsx:13` | the Maestro server is unreachable | inline |
| `inventory/config-unreachable-notice.tsx:14` | Nothing on this screen can load until it answers. Check that it is still running, then try again. | inline |
| `inventory/inventory-panel.tsx:22` | no Harness is connected | inline |
| `inventory/inventory-panel.tsx:23` | Nothing is connected yet. Connect a Harness on the Inventory source screen to fill this list. | inline |
| `inventory/inventory-panel.tsx:28` | the inventory did not load | inline |
| `inventory/inventory-panel.tsx:29` | The connected Harness may have moved, or its apm.yml may no longer be readable. Check the source path on the Inventory source screen. | inline |
| `shell/inventory-source-view.tsx:25` | the inventory did not load | inline |
| `shell/inventory-source-view.tsx:26` | The folder below may have moved, or its apm.yml may no longer be readable. Check the path, then re-read. | inline |
| `harness/movement-table.tsx:36` | changed by a teammate | inline |
| `harness/movement-table.tsx:38` | Promoting is refused until their change is pulled into the Harness clone. | inline |
| `inventory/deploy-skill-action.tsx:153` | deployed | inline |
| `inventory/deploy-skill-action.tsx:154` | `${name} ${version} is installed on this target.` | inline |
| `inventory/bulk-deploy-report.tsx:16` | deployed copy has local changes | view-model |
| `inventory/bulk-deploy-report.tsx:17` | deployed copy predates content tracking | view-model |
| `inventory/bulk-deploy-report.tsx:18` | local copy diverged from its tag | view-model |
| `inventory/bulk-deploy-report.tsx:19` | no published tag contains it | view-model |
| `inventory/bulk-deploy-report.tsx:20` | GitHub authentication is missing or expired | view-model |
| `inventory/bulk-deploy-report.tsx:21` | the deploy could not be completed | view-model |
| `inventory/bulk-deploy-report.tsx:22` | apm recorded a type Maestro cannot manage as a skill | view-model |
| `inventory/bulk-deploy-report.tsx:24` | apm recorded the deployment as invalid | view-model |
| `inventory/bulk-deploy-report.tsx:25` | apm's install could not be confirmed from the lockfile | view-model |
| `inventory/bulk-deploy-report.tsx:68` | `Deploy to {target} failed: {message}` | inline |
| `inventory/bulk-deploy-report-view.ts:69` | The deploy request failed. | view-model |
| `inventory/bulk-remove-report-view.ts:20` | Maestro lost its server's answer and cannot say what was removed. Close this and check the targets before trying again. | view-model |
| `inventory/bulk-remove-report-view.ts:78` | the run never started | view-model |
| `inventory/bulk-remove-report-view.ts:79` | `${message} Nothing was removed anywhere. Try again.` | view-model |
| `inventory/bulk-remove-report-view.ts:83` | the outcome is unknown | view-model |
| `inventory/bulk-remove-report-view.ts:50–62` | 12 `FAILURE_REASON` phrases (type cannot be removed · not a valid skill name · repo not registered · no supported tool here · nothing deployed here · lockfile could not be read · its version could not be resolved · deployed copy could not be read · what it would delete was never confirmed · target is held by another operation · apm did not complete the removal) | view-model |
| `inventory/bulk-remove-dialog-view.ts:65–69` | 5 `REFUSAL_REASON` phrases (repo not registered · no supported tool here · not a valid skill name · type cannot be removed · malformed request) | view-model |
| `registry/use-register-repos.ts:87` | registered | inline |
| `registry/use-register-repos.ts:95` | could not reach Maestro to register it | inline |
| `registry/use-register-repos.ts:101` | `skipped · ${message}` | inline |
| `harness/import-view-model.ts:17–28` | 6 `SOURCE_BLOCKER_TEXT` sentences | view-model |
| `harness/import-view-model.ts:33–36` | 2 `NAME_BLOCKER_TEXT` sentences | view-model |
| `deploy-state/skipped-entry-text.ts:5` | Fix the package shape in the harness, release a corrected tag, and deploy again. | view-model |
| `deploy-state/skipped-entry-text.ts:10` | `Skipped {path} — Maestro does not manage {type}. Its files are still in place.` | view-model |
| `deploy-state/skipped-entry-text.ts:13` | `{path} is deployed as {type}, which Maestro cannot manage as a skill…` | view-model |
| `deploy-state/skipped-entry-text.ts:16` | `apm recorded {path} as a failed deployment and placed no files.` | view-model |
| `deploy-state/skipped-entry-text.ts:21–22` | Could not read one lockfile entry. / `Could not read the lockfile entry for {path}.` | view-model |

### Request-shape messages (8)

`packages/server/src/app.ts`, inline. Read by the user only when a request is
malformed, but they land in the same Notice slot as every sentence above.

| Line | Text |
|---:|---|
| 150 | Expected a JSON body with a skill name. |
| 152 | Expected a JSON body with a skill name and the origin/HEAD tree it was confirmed against. |
| 155 | Expected a JSON body with a version step and the plan's previous tag… |
| 158 | Expected a JSON body with a path. |
| 160 | Expected a JSON body with a source folder and an optional name. |
| 163 | Expected a JSON body with type, name, and target… |
| 166 | Expected a JSON body with a non-empty names array and a target… |
| 1355 | Expected a JSON body with a name and a non-empty targets array… |

---

## warning — 21

| File · line | Text | Where |
|---|---|---|
| `deploy-state/remove-skill-dialog.tsx:347` | retry removes only what is left | inline |
| `deploy-state/remove-ledger-rows.ts:51` | not installed — copy deleted in full | view-model |
| `deploy-state/remove-ledger-rows.ts:52` | not installed — local edits deleted too | view-model |
| `deploy-state/remove-ledger-rows.ts:53` | not installed — nothing recorded to check | view-model |
| `deploy-state/remove-ledger-rows.ts:54` | not installed — check didn't run | view-model |
| `deploy-state/remove-ledger-rows.ts:60` | local edits — deleted too | view-model |
| `deploy-state/remove-ledger-rows.ts:61` | nothing recorded — may lose work | view-model |
| `deploy-state/remove-ledger-rows.ts:62` | check didn't run — may lose work | view-model |
| `inventory/bulk-remove-dialog-view.ts:48` | local edits — deleted too | view-model |
| `inventory/bulk-remove-dialog-view.ts:49` | nothing recorded — may lose work | view-model |
| `inventory/bulk-remove-dialog-view.ts:50` | check did not run | view-model |
| `inventory/bulk-remove-dialog.tsx:249` | `▲ LOSES WORK · {n}` | inline |
| `inventory/bulk-remove-dialog.tsx:257` | `✕ CAN'T BE REMOVED · {n}` | inline |
| `inventory/bulk-remove-dialog.tsx:324` | `✕ LEFT ALONE · {n}` | inline |
| `harness/import-dialog.tsx:148` | Convention checks — advisory, does not block import | inline |
| `harness/import-view-model.ts:42` | SKILL.md is over 500 lines. | view-model |
| `harness/import-view-model.ts:43` | The description is over 1,024 characters. | view-model |
| `harness/release-dialog.tsx:181` | Structural checks — advisory, does not block release | inline |
| `harness/release-dialog.tsx:26` | has no SKILL.md | view-model |
| `harness/release-dialog.tsx:27` | has frontmatter that does not parse | view-model |
| `harness/release-dialog.tsx:28` | has an empty description | view-model |

---

## confirmation dialog — 45

| File · line | Text | Where |
|---|---|---|
| `deploy-state/remove-skill-dialog.tsx:20` | Checking this copy for local edits… | inline |
| `deploy-state/remove-skill-dialog.tsx:28` | removed | inline |
| `deploy-state/remove-skill-dialog.tsx:29` | not removed | inline |
| `deploy-state/remove-skill-dialog.tsx:30` | outcome unknown | inline |
| `deploy-state/remove-skill-dialog.tsx:34–36` | ✓ · ✕ · ? *(outcome glyphs)* | inline |
| `deploy-state/remove-skill-dialog.tsx:102` | ▲ *(cost glyph)* | inline |
| `deploy-state/remove-skill-dialog.tsx:171` | `Remove {name} {version}?` *(accessible name)* | inline |
| `deploy-state/remove-skill-dialog.tsx:253` | `Remove {name}?` *(visible `h2`)* | inline |
| `deploy-state/remove-skill-dialog.tsx:379` | close / cancel | inline |
| `deploy-state/remove-skill-dialog.tsx:395` | removing… / retry → / remove → | inline |
| `deploy-state/remove-ledger-rows.ts:17–20` | Skill · Hook · MCP · Bundle | view-model |
| `deploy-state/remove-ledger-rows.ts:98` | `{Type} will be removed from:` | view-model |
| `deploy-state/remove-ledger-rows.ts:106` | `Removed from {n} of {m} target(s):` | view-model |
| `inventory/bulk-remove-dialog-view.ts:117` | `checking {n} targets — {m} answered` | view-model |
| `inventory/bulk-remove-dialog-view.ts:152` | `{n} clean copies — nothing but the deployed files goes` | view-model |
| `inventory/bulk-remove-dialog-view.ts:153` | `{n} clean copies` | view-model |
| `inventory/bulk-remove-dialog-view.ts:159` | `remove from {n} →` | view-model |
| `inventory/bulk-remove-dialog-view.ts:160` | `remove from {n} · {m} lose local edits →` | view-model |
| `inventory/bulk-remove-dialog.tsx:198` | Removing | inline |
| `inventory/bulk-remove-dialog.tsx:199` | Remove / ` from {n} targets?` | inline |
| `inventory/bulk-remove-dialog.tsx:204` | done / cancel / close | inline |
| `inventory/bulk-remove-dialog.tsx:354` | `walking {n} targets, one at a time` | inline |
| `inventory/bulk-remove-dialog.tsx:396` | removing… | inline |
| `inventory/bulk-remove-dialog.tsx:397` | `remove from {n} →` | inline |
| `inventory/bulk-remove-report-view.ts:95` | `removed {a} · refused {b} · failed {c}` | view-model |
| `inventory/bulk-remove-report-view.ts:98` | Removed | view-model |
| `inventory/bulk-remove-report-view.ts:104` | ` from {n} of {m}` | view-model |
| `inventory/bulk-remove-report-view.ts:126` | — still there | view-model |
| `inventory/bulk-remove-report-view.ts:129` | — gone anyway | view-model |
| `harness/deletion-dialog.tsx:30` | `Remove {skill}` *(accessible name)* | inline |
| `harness/deletion-dialog.tsx:51` | `Remove {skill}` *(visible `h2`)* | inline |
| `harness/deletion-dialog.tsx:57–60` | You deleted {skill} from the Harness working tree. Confirming proposes that removal to {origin} on its own branch — nobody loses it until the pull request is merged. | inline |
| `harness/deletion-dialog.tsx:64–69` | Skill · Branch · Confirmed against *(fact labels)* | inline |
| `harness/deletion-dialog.tsx:85` | cancel | inline |
| `harness/deletion-dialog.tsx:95` | removing… / remove | inline |
| `harness/release-dialog.tsx:54` | `Release {origin}` *(accessible name)* | inline |
| `harness/release-dialog.tsx:97` | `Release {origin}` *(visible `h2`)* | inline |
| `harness/release-dialog.tsx:131` | close | inline |
| `harness/release-dialog.tsx:143` | publishing… / publish | inline |
| `harness/release-dialog.tsx:168` | No skill has changed since the last release. | inline |
| `harness/release-dialog.tsx:211` | `Maestro proposed {version} — {reason}` | inline |
| `harness/import-dialog.tsx:75` | Import a skill *(accessible name)* | inline |
| `harness/import-dialog.tsx:81` | Import a skill *(visible `h2`)* | inline |
| `harness/import-dialog.tsx:185` | close | inline |
| `harness/import-dialog.tsx:195` | importing… / import | inline |

---

## empty state — 14

| File · line | Text | Where |
|---|---|---|
| `deploy-state/deploy-state-view.tsx:35` | nothing deployed | inline |
| `deploy-state/global-targets.tsx:62` | no supported tool detected | inline |
| `deploy-state/global-targets.tsx:63` | Install Claude Code or Codex to deploy skills globally. | inline |
| `inventory/inventory-list.tsx:91` | No skills found in the inventory. | inline |
| `inventory/inventory-list.tsx:210` | No skills match your search. | inline |
| `inventory/skill-detail-pane.tsx:141` | not deployed to any target yet | inline |
| `inventory/deployed-cell.tsx:25` | not deployed | inline |
| `inventory/global-option-label.ts:12` | Global (no tools detected) | view-model |
| `registry/register-repo-hint.tsx:11–12` | No repositories registered. Register one with `+ repo` in the sidebar. | inline |
| `shell/sidebar.tsx:64` | none yet | inline |
| `harness/harness-strip.tsx:23` | none yet *(released version)* | inline |
| `harness/harness-strip.tsx:24` | unknown *(default branch)* | inline |
| `harness/release-dialog.tsx:196` | none yet *(previous tag)* | inline |
| `harness/pending-release.tsx:65` | unknown *(author)* | inline |

---

## loading state — 20

| File · line | Text | Where |
|---|---|---|
| `connect-gate/connect-view.tsx:28` | Loading… | inline |
| `deploy-state/deploy-state-panel.tsx:42` | Loading… | inline |
| `deploy-state/deploy-state-view.tsx:86` | Loading registered repos… | inline |
| `deploy-state/global-targets.tsx:47` | Loading… | inline |
| `inventory/inventory-panel.tsx:64` | Loading… | inline |
| `shell/first-run-gate.tsx:34` | Loading… | inline |
| `shell/browse-dialog.tsx:211` | Loading… | inline |
| `shell/browse-dialog.tsx:189` | … *(breadcrumb placeholder)* | inline |
| `harness/harness-view.tsx:157` | Loading the harness… | inline |
| `harness/release-dialog.tsx:110` | Planning the release… | inline |
| `inventory/deployed-cell.tsx:24` | … | inline |
| `inventory/deployed-cell.tsx:72` | checking… | inline |
| `inventory/skill-detail-pane.tsx:134` | more targets may still be loading… | inline |
| `inventory/skill-detail-pane.tsx:139` | still reading deploy state… | inline |
| `shell/primitive-count-label.ts:4` | reading… | view-model |
| `shell/inventory-source-view.tsx:39` | reading… | inline |
| `shell/inventory-source-view.tsx:133` | Loading source… *(skeleton region name)* | inline |
| `shell/inventory-source-view.tsx:142` | ● loading *(skeleton placeholder text)* | inline |
| `shell/browse-run-report.tsx:37` | Registering… | inline |
| `shell/browse-run-report.tsx:38` | ` {n} of {m}` | inline |

---

## status line or badge — 74

| File · line | Text | Where |
|---|---|---|
| `deploy-state/target-status-chip.tsx:13` | ● in sync | inline |
| `deploy-state/target-status-chip.tsx:16` | ▲ attention | inline |
| `deploy-state/target-status-chip.tsx:19` | ▲ drift | inline |
| `deploy-state/target-status-chip.tsx:24` | ● empty | inline |
| `deploy-state/deploy-state-list.tsx:41` | behind | inline |
| `deploy-state/deploy-state-list.tsx:42` | up-to-date | inline |
| `deploy-state/deploy-state-list.tsx:43` | unknown | inline |
| `deploy-state/deploy-state-list.tsx:48` | unverified | inline |
| `deploy-state/deploy-state-list.tsx:162` | `{version} → {latest}` | inline |
| `deploy-state/deploy-state-list.tsx:273` | `Reported behind, not deployed here: {names}` | inline |
| `deploy-state/removal-announcement.ts:26` | every detected tool | view-model |
| `deploy-state/removal-announcement.ts:27` | `removed {name} {version} from {scope}` | view-model |
| `deploy-state/removal-announcement.ts:27` | (version unknown) | view-model |
| `deploy-state/removal-trace.tsx:10` | ✓ | inline |
| `deploy-state/tool-labels.ts:15` | ` and ` *(list conjunction)* | view-model |
| `deploy-state/tool-presentation.ts:11` | Claude Code · ~/.claude/skills | view-model |
| `deploy-state/tool-presentation.ts:12` | Codex · ~/.agents/skills | view-model |
| `inventory/deployed-cell.tsx:20` | `→ {n} target(s)` | inline |
| `inventory/deployed-cell.tsx:72` | checking… | inline |
| `inventory/deploy-skill-action.tsx:133` | `● in sync · {version}` / ● in sync | inline |
| `inventory/skill-detail-pane.tsx:179–181` | behind · unknown · unverified *(pane chips)* | inline |
| `inventory/skill-detail-pane.tsx:198` | `{version} → {latest}` | inline |
| `inventory/global-option-label.ts:9` | Global | view-model |
| `inventory/global-option-label.ts:14` | `Global ({tools})` | view-model |
| `inventory/bulk-remove-targets.ts:17` | global | view-model |
| `inventory/bulk-remove-targets.ts:56` | unknown *(version)* | view-model |
| `inventory/bulk-deploy-report-view.ts:41–44` | failed · attention · deployed · skipped | view-model |
| `inventory/bulk-deploy-report-view.ts:49` | nothing to do | view-model |
| `inventory/bulk-deploy-report-view.ts:50` | `Deployed to {target} · {tail}` | view-model |
| `inventory/bulk-deploy-report.tsx:75` | Deploying… | inline |
| `inventory/bulk-deploy-report.tsx:121` | ✓ | inline |
| `inventory/bulk-deploy-report.tsx:138` | ↑ | inline |
| `inventory/bulk-deploy-report.tsx:143` | updated to latest | inline |
| `inventory/bulk-deploy-report.tsx:157` | ▲ attention | inline |
| `inventory/bulk-deploy-report.tsx:188` | ✕ | inline |
| `inventory/bulk-deploy-report.tsx:208` | – | inline |
| `inventory/bulk-deploy-report.tsx:212` | already up to date | inline |
| `inventory/bulk-deploy-bar.tsx:137` | `{n} staged for bulk` | inline |
| `inventory/bulk-deploy-bar.tsx:140` | `· {n} hidden by the filter` | inline |
| `harness/harness-view-model.ts:28` | just now | view-model |
| `harness/harness-view-model.ts:31` | `{n} min ago` | view-model |
| `harness/harness-view-model.ts:34` | `{n} h ago` | view-model |
| `harness/harness-view-model.ts:36` | `on {day month}` | view-model |
| `harness/harness-view-model.ts:48` | Not fetched yet | view-model |
| `harness/harness-view-model.ts:51` | `Fetched {since}` | view-model |
| `harness/harness-view-model.ts:55` | Offline | view-model |
| `harness/harness-view-model.ts:55` | Fetch failed | view-model |
| `harness/harness-view-model.ts:57` | `{cause} — never fetched` | view-model |
| `harness/harness-view-model.ts:58` | `{cause} — last fetched {since}` | view-model |
| `harness/harness-view-model.ts:98` | Everything merged is released. | view-model |
| `harness/harness-view-model.ts:99` | Merged changes are waiting for release. | view-model |
| `harness/harness-view-model.ts:100` | No release yet. | view-model |
| `harness/harness-view-model.ts:101` | Not fetched yet, so what is waiting is unknown. | view-model |
| `harness/movement-table.tsx:88` | deleted locally | inline |
| `shell/status-bar.tsx:34` | connecting… | inline |
| `shell/status-bar.tsx:36` | setup required · no inventory connected | inline |
| `shell/status-bar.tsx:41` | connected | inline |
| `shell/status-bar.tsx:42` | disconnected | inline |
| `shell/target-item.tsx:26–38` | `▲{n}` · ? · in sync · empty · attention · unverified · checking… | inline |
| `shell/primitive-count-label.ts:5` | `{n} primitive(s)` | view-model |
| `shell/browse-run-report.tsx:45` | `✓ {n} registered` | inline |
| `shell/browse-run-report.tsx:51` | `✕ {n} skipped` | inline |
| `shell/browse-run-report.tsx:81` | · / ✓ / ✕ | inline |
| `shell/browse-entry-row.tsx:28` | central inventory | inline |
| `shell/browse-entry-row.tsx:30` | not a git repo | inline |
| `shell/browse-entry-row.tsx:70` | ↳ symlink | inline |
| `shell/browse-modes.tsx:31` | ● registered | view-model |
| `shell/browse-modes.tsx:39,49,59` | ◆ inventory *(three modes)* | view-model |
| `shell/browse-dialog.tsx:181` | already at home | inline |
| `shell/browse-dialog.tsx:236–241` | `{n} hidden item(s)` · shown / not shown · hide / show | inline |
| `connect-gate/connect-success-view.tsx:28` | `✓ {count} found` | inline |
| `connect-gate/connect-success-view.tsx:34` | `✓ Harness joined · {count} found` | inline |
| `connect-gate/connect-success-view.tsx:40` | ✓ Harness scaffolded · the Harness is empty | inline |
| `shell/inventory-source-view.tsx:95` | `● {countLabel}` | inline |

---

## button or action label — 50

| File · line | Text | Where |
|---|---|---|
| `connect-gate/welcome-view.tsx:26` | Connect inventory → | inline |
| `connect-gate/connect-success-view.tsx:30,36` | Continue to inventory → | inline |
| `connect-gate/connect-success-view.tsx:43` | Continue to Harness → | inline |
| `deploy-state/target-deploy-action.tsx:12` | deploy → | inline |
| `deploy-state/deploy-state-list.tsx:176` | remove… | inline |
| `deploy-state/update-skill-action.tsx:34` | updating… / update → | inline |
| `deploy-state/remove-skill-dialog.tsx:329` | remove → *(restated-cost action)* | inline |
| `inventory/config-unreachable-notice.tsx:16` | Try again | inline |
| `inventory/deploy-refusal-notice.tsx:49` | Reinstall fresh — local changes will be lost | inline |
| `inventory/deploy-skill-action.tsx:81–84` | loading targets… / deploying… / deploy → | inline |
| `inventory/deploy-skill-action.tsx:123` | deploying… / re-deploy | inline |
| `inventory/bulk-deploy-bar.tsx:89–92` | loading targets… / deploying… / `deploy {n} →` | inline |
| `inventory/bulk-deploy-report.tsx:173` | `Reinstall fresh {name}` | inline |
| `inventory/bulk-remove-skill-action.tsx:47` | `remove from all {n} →` | inline |
| `inventory/skill-detail-pane.tsx:113` | more › | inline |
| `inventory/skill-detail-pane.tsx:114` | less ‹ | inline |
| `harness/harness-view.tsx:176` | release | inline |
| `harness/harness-view.tsx:185` | refresh | inline |
| `harness/harness-view.tsx:194` | import skill | inline |
| `harness/movement-table.tsx:139` | pull request → | inline |
| `harness/movement-table.tsx:172` | promoting… / promote | inline |
| `harness/import-dialog.tsx:105` | pick folder / change | inline |
| `shell/connect-inventory-form.tsx:42` | Connect inventory *(default submit label)* | inline |
| `shell/connect-inventory-form.tsx:87` | browse… | inline |
| `shell/connect-inventory-form.tsx:106` | change folder… | inline |
| `shell/connect-inventory-panel.tsx:35` | browse again… | inline |
| `shell/connect-inventory-panel.tsx:37,41` | choose another folder… | inline |
| `shell/connect-inventory-panel.tsx:88` | Scaffolding… / Scaffold the Harness | inline |
| `shell/inventory-source-view.tsx:62` | Re-point source | inline |
| `shell/inventory-source-view.tsx:70` | Cancel | inline |
| `shell/inventory-source-view.tsx:106` | reading… / Re-read | inline |
| `shell/inventory-source-view.tsx:113` | Change source | inline |
| `shell/sidebar-register.tsx:19` | + repo | inline |
| `shell/browse-dialog.tsx:173` | ↑ up | inline |
| `shell/browse-dialog.tsx:287` | cancel | inline |
| `shell/browse-dialog.tsx:298` | close | inline |
| `shell/browse-modes.tsx:27` | `register {n} selected →` | view-model |
| `shell/browse-modes.tsx:37` | use this folder → | view-model |
| `shell/browse-modes.tsx:47` | import this folder → | view-model |
| `shell/browse-modes.tsx:57` | clone into this folder → | view-model |
| `harness/release-dialog.tsx:18–20` | patch · minor · major | view-model |
| `inventory/type-filter.ts:13–16` | skills · hooks · mcp servers · bundles | view-model |
| `inventory/type-filter.ts:29` | all | view-model |
| `ui/actions-menu.tsx:34` | ⋯ | inline |
| `shell/browse-dialog.tsx:146` | ✕ *(dialog close glyph)* | inline |
| `inventory/skill-detail-pane.tsx:73` | ✕ *(pane close glyph)* | inline |
| `shell/status-bar.tsx:140` | ⚙ | inline |
| `inventory/inventory-list.tsx:285` | › *(row expand glyph)* | inline |
| `inventory/inventory-list.tsx:370` | ↑ / ↓ *(sort glyphs)* | inline |
| `shell/browse-entry-row.tsx:83` | → *(hover glyph)* | inline |

*(A row listing two or three labels is one site whose label depends on state —
`deploying…` / `deploy →`. The alternates are copy too, and each one needs
reviewing.)*

---

## heading or nav label — 60

| File · line | Text | Where |
|---|---|---|
| `packages/web/index.html:6` | Maestro *(browser tab)* | inline |
| `ui/logo.tsx:40` | M *(mark)* | inline |
| `ui/logo.tsx:47` | Maestro *(wordmark)* | inline |
| `connect-gate/welcome-view.tsx:15` | Central inventory not connected | inline |
| `connect-gate/connect-view.tsx:36` | Connect central inventory | inline |
| `connect-gate/connect-view.tsx:37` | a local Harness clone or GitHub URL | inline |
| `deploy-state/deploy-state-view.tsx:32` | Deploy-state | inline |
| `deploy-state/deploy-state-view.tsx:37` | `{n} target(s)` | inline |
| `deploy-state/deploy-state-view.tsx:59` | Repositories | inline |
| `deploy-state/deploy-state-view.tsx:64` | `{n} registered` | inline |
| `deploy-state/global-targets.tsx:43` | Global targets | inline |
| `deploy-state/global-targets.tsx:44` | `{n} detected` | inline |
| `inventory/inventory-panel.tsx:52` | Central inventory | inline |
| `inventory/inventory-panel.tsx:55` | `{n} skill(s)` | inline |
| `inventory/inventory-list.tsx:185` | Type | inline |
| `inventory/inventory-list.tsx:193` | Name | inline |
| `inventory/inventory-list.tsx:197` | Description | inline |
| `inventory/inventory-list.tsx:200` | Deployed | inline |
| `inventory/skill-detail-pane.tsx:60` | Skill | inline |
| `inventory/skill-detail-pane.tsx:122` | Deployed to | inline |
| `inventory/skill-detail-pane.tsx:149` | Deploy | inline |
| `inventory/skill-detail-pane.tsx:151` | Remove | inline |
| `harness/harness-view.tsx:147` | Harness | inline |
| `harness/harness-view-model.ts:67` | Pending review | view-model |
| `harness/harness-view-model.ts:68` | Pushed, waiting for input | view-model |
| `harness/harness-view-model.ts:72` | Pending promotion | view-model |
| `harness/harness-view-model.ts:73` | local on disk | view-model |
| `harness/pending-release.tsx:37` | Pending release | inline |
| `harness/pending-release.tsx:38` | `{n} · Ready to be released` | inline |
| `harness/pending-release.tsx:16–19` | Added · Changed · Renamed · Removed | view-model |
| `harness/pending-release.tsx:53` | Author | inline |
| `harness/movement-table.tsx:67` | Type | inline |
| `harness/movement-table.tsx:68` | Name | inline |
| `harness/movement-table.tsx:69` | Action | inline |
| `harness/harness-strip.tsx:23` | Released | inline |
| `harness/harness-strip.tsx:24` | Branch | inline |
| `harness/harness-strip.tsx:25` | Status | inline |
| `harness/release-dialog.tsx:196` | Previous tag | inline |
| `harness/release-dialog.tsx:197` | Branch | inline |
| `harness/release-dialog.tsx:200` | Revision | inline |
| `harness/release-dialog.tsx:204` | Releasing as | inline |
| `shell/sidebar.tsx:17` | Consume | inline |
| `shell/sidebar.tsx:19` | Deploy-state · ⇶ | inline |
| `shell/sidebar.tsx:20` | Inventory · ▤ | inline |
| `shell/sidebar.tsx:24` | Author | inline |
| `shell/sidebar.tsx:25` | Harness · ✎ | inline |
| `shell/sidebar.tsx:62` | Targets | inline |
| `shell/status-bar.tsx:31` | Inventory source | inline |
| `shell/inventory-source-view.tsx:17` | Inventory source | inline |
| `shell/inventory-source-view.tsx:18` | local path · read-only | inline |
| `shell/inventory-source-view.tsx:54` | Change inventory source | inline |
| `shell/inventory-source-view.tsx:55` | re-point at another local folder | inline |
| `shell/source-label.tsx:8` | Source · local folder | inline |
| `shell/browse-dialog.tsx:95` | Registration result | inline |
| `shell/browse-modes.tsx:26` | Select repos to register | view-model |
| `shell/browse-modes.tsx:36` | Select inventory folder | view-model |
| `shell/browse-modes.tsx:46` | Select a skill folder | view-model |
| `shell/browse-modes.tsx:56` | Select a folder to clone into | view-model |
| `ui/card.tsx:56` | global / local *(card kind label)* | inline |
| `ui/type-tag.tsx:31` | skill · hook · mcp · bundle | inline |

---

## field label or placeholder — 14

| File · line | Text | Where |
|---|---|---|
| `shell/connect-inventory-form.tsx:68` | Inventory path or GitHub URL | inline |
| `shell/connect-inventory-form.tsx:77` | /path/to/harness or https://github.com/owner/repo | inline |
| `inventory/inventory-list.tsx:125` | Search skills *(sr-only label)* | inline |
| `inventory/inventory-list.tsx:138` | search… | inline |
| `inventory/inventory-list.tsx:131` | ⌕ | inline |
| `shell/browse-dialog.tsx:194` | Filter this folder *(sr-only label)* | inline |
| `shell/browse-dialog.tsx:196` | ⌕ | inline |
| `shell/browse-dialog.tsx:202` | filter this folder… | inline |
| `shell/browse-dialog.tsx:273` | or paste | inline |
| `shell/browse-dialog.tsx:280` | /absolute/path… | inline |
| `harness/import-dialog.tsx:87` | Skill folder | inline |
| `harness/import-dialog.tsx:115` | Name in the Harness | inline |
| `inventory/bulk-deploy-bar.tsx:146` | Bulk-deploy target *(sr-only label)* | inline |
| `inventory/deploy-skill-action.tsx:91` | `Deploy {skill} to` *(sr-only label)* | inline |

---

## help or aside text — 19

| File · line | Text | Where |
|---|---|---|
| `connect-gate/welcome-view.tsx:18–19` | Maestro reads primitives from a local Harness clone or a GitHub repository. The cockpit stays empty until it has one. | inline |
| `connect-gate/connect-view.tsx:41–42` | A private Harness works when each teammate has their own Git and APM access. | inline |
| `connect-gate/connect-success-view.tsx:29` | Deploys never write back to this Harness. | inline |
| `connect-gate/connect-success-view.tsx:35` | The cloned Harness is ready in Inventory. | inline |
| `connect-gate/connect-success-view.tsx:42` | The skill-check workflow is advisory. It only becomes a gate if the team makes it a required check. | inline |
| `shell/connect-inventory-form.tsx:94–97` | `Clone into {parent}/{child}` | inline |
| `shell/connect-inventory-form.tsx:96` | your home folder | inline |
| `shell/connect-inventory-form.tsx:116–117` | Connecting. A GitHub URL is being cloned first, which can take a minute — this stays open until it finishes. | inline |
| `shell/browse-modes.tsx:32` | Registering writes nothing. Writes happen only on an explicit deploy. | view-model |
| `shell/browse-modes.tsx:50` | Picking a folder writes nothing. Import copies it into the Working harness and changes nothing at the source. | view-model |
| `shell/browse-modes.tsx:60` | The Harness is cloned into a new folder here, named after the repository. Nothing already in this folder is renamed, moved or deleted. | view-model |
| `harness/import-dialog.tsx:96` | No folder picked yet. | inline |
| `harness/import-dialog.tsx:131–132` | This becomes the folder name, and the SKILL.md name is rewritten to match. | inline |
| `harness/import-dialog.tsx:162–168` | `{name} landed in the Harness as a pending promotion.` · ` 1 .git entry was skipped.` · ` {n} .git entries were skipped.` | inline |
| `deploy-state/deploy-state-list.tsx:49` | Couldn't reach the source to check for updates — verify apm auth/network. | inline |
| `inventory/deploy-refusal-notice.tsx:36` | `Recorded type: {type}.` | inline |
| `inventory/bulk-deploy-report.tsx:31–36` | 3 `recoverySteps` sentences | view-model |
| `inventory/deployed-cell.tsx:27` | deploy state could not be read on every target | inline |
| `inventory/deployed-cell.tsx:28` | still reading deploy state | inline |

---

## screen-reader-only or aria label — 40

Words no sighted reader ever sees. They are copy, and today nothing reviews them.

| File · line | Text | Where |
|---|---|---|
| `deploy-state/deploy-state-list.tsx:173` | `Actions for {name}` | inline |
| `deploy-state/remove-skill-dialog.tsx:274` | Removed from | inline |
| `deploy-state/remove-skill-dialog.tsx:285` | Also deleted | inline |
| `deploy-state/remove-skill-dialog.tsx:362` | Local-edits check | inline |
| `deploy-state/update-skill-action.tsx:28` | `Updating {name}…` / `Update {name}` | inline |
| `inventory/bulk-deploy-bar.tsx:134` | Bulk selection | inline |
| `inventory/bulk-deploy-report.tsx:65,87` | Bulk deploy result | inline |
| `inventory/bulk-deploy-report.tsx:109` | Bulk deploy result detail | inline |
| `inventory/bulk-deploy-report.tsx:115` | Deployed | inline |
| `inventory/bulk-deploy-report.tsx:132` | Updated to latest | inline |
| `inventory/bulk-deploy-report.tsx:150` | Needs attention | inline |
| `inventory/bulk-deploy-report.tsx:182` | Failed | inline |
| `inventory/bulk-deploy-report.tsx:203` | Skipped, already up to date | inline |
| `inventory/bulk-remove-dialog.tsx:310` | Bulk remove result | inline |
| `inventory/deployed-cell.tsx:33` | `{n} target(s); {reason}` | inline |
| `inventory/deployed-cell.tsx:38` | `{n} target(s) is/are behind the latest version` | inline |
| `inventory/deployed-cell.tsx:41` | `Drift check could not run on {n} target(s)` | inline |
| `inventory/inventory-list.tsx:163` | Central inventory table | inline |
| `inventory/inventory-list.tsx:177` | Stage for bulk | inline |
| `inventory/inventory-list.tsx:202` | Expand | inline |
| `inventory/inventory-list.tsx:234` | `Stage {name} for bulk` | inline |
| `inventory/skill-detail-pane.tsx:53` | `{name} detail` | inline |
| `inventory/skill-detail-pane.tsx:63` | Close detail pane | inline |
| `inventory/skill-detail-pane.tsx:194` | in sync | inline |
| `harness/import-dialog.tsx:144` | Convention checks | inline |
| `harness/release-dialog.tsx:177` | Structural checks | inline |
| `harness/release-dialog.tsx:215` | Version step | inline |
| `shell/browse-breadcrumbs.tsx:17` | Breadcrumbs | inline |
| `shell/browse-dialog.tsx:142` | Close | inline |
| `shell/browse-entry-row.tsx:45` | `Select {name}` / `Select {name}: {reason}` | inline |
| `shell/browse-run-report.tsx:57` | Registration results | inline |
| `shell/browse-run-report.tsx:94` | waiting | inline |
| `shell/browse-run-report.tsx:96` | registered | inline |
| `shell/sidebar.tsx:37` | Sidebar | inline |
| `shell/targets-list.tsx:48` | Targets | inline |
| `shell/target-item.tsx:26` | `{n} behind` | inline |
| `shell/target-item.tsx:28` | unknown | inline |
| `shell/inventory-source-view.tsx:133` | Loading source… | inline |
| `inventory/inventory-list.tsx:145` | Filter by type *(SegmentedControl legend)* | inline |
| `deploy-state/deploy-state-list.tsx:84` | *(drift-badge `title` hint, see help text)* | inline |

---

## What the sweep is up against

Three facts the count makes concrete:

1. **The copy modules cover one shape only.** All 121 module sites are Notice
   *headings*, their ten fallback labels, and one fallback sentence. Every button, heading, badge, empty
   state, and aside — 535 sites — sits somewhere else.
2. **The sentence and its heading live in different repositories of meaning.**
   130 sentences are authored in one 1,633-line route file (`app.ts`); their
   headings are in four separate `web` modules. Nothing holds a pair together
   except a shared error code and the compiler.
3. **Duplicates already exist.** `no folder at that path` appears three times,
   `not a folder` five, `no path given` three, `the name is not a slug` three,
   `A skill name is lowercase letters, digits and single hyphens, like
   code-review.` twice, `local edits — deleted too` twice, `nothing recorded —
   may lose work` twice, `Reload the page to run the read again.` three times.
   Each is a separate literal that can drift on its own.
