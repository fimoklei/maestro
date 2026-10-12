# Changelog

## v0.1.3 — 2026-10-12

### New Features
- **Grouped Inventory views in the sidebar.** The Inventory screen is now **Skills**, the first view under a new **Inventory** heading. It lives at `/inventory/skills`. (#1512)
- **Restyled the Harness button in the sidebar.** It shows a letter mark, the Harness name and the release. It no longer shows the skill count. (#1507)
- **Showed each table screen's data source, read age and status counts.** The second row of each table screen states where its data comes from and how old it is. A dot shows the worst status on the screen, and each count works as a status filter. (#1484, #1498)
- **Moved actions that remove or delete behind ⋯ in detail panes.** The pane foot now fits on one line. (#1488)
- **Made Skills work by keyboard and screen reader.** You can use the table and the detail pane without a mouse, and screen readers announce them. (#1473)
- **Made bulk deploy ask for a target first.** The dialog shows what will change before you deploy. (#1472)
- **Showed each target's real state on Skills.** A locally edited copy reads **Local edits** everywhere, and the detail pane explains the skill's state. (#1466)
- **Used one hover card and name cell on every table screen.** Names and hover cards look and work the same on each screen. (#1462)
- **Made a Contributor wait on another's open proposal.** While another Contributor's pull request is open on a skill's proposal branch, you can't write to that branch. (#1429)
- **Showed the kind of change on each Harness row.** Each row says whether it adds, edits, renames or deletes a skill. (#1426)
- **Set names and technical values apart in sentences.** Names show in medium weight. Versions, tags, paths and commands show in a monospace font. (#1416, #1422)
- **Added Group by Status to Deploy-state.** **Display** groups targets by status, worst first. A target that has not been read yet shows under **Not read yet**. (#1406)
- **Shortened cockpit copy.** Each screen, dialog and notice now says one thing. (#1398)
- **Added Discard change to the Harness.** A **Not yet proposed** row can go back to the skill's copy on the default branch. (#1397)
- **Split deleting a released skill into two steps.** **Delete skill** removes the folder from your clone. **Propose change** then opens a pull request titled `Delete skill: {name}`. (#1387)

### Bug Fixes
- **Fixed the More toggle in the detail pane.** A long description now folds to three lines. A linked Origin no longer starts with `github.com/`. (#1508)
- **Stopped the Harness name from taking a repository's label.** (#1502)
- **Marked each dropped skill on a root-package target.** A skill the latest release dropped reads **No longer released**. **Update target** removes it. (#1501)
- **Set skill names in the UI font in the Discard, Withdraw and Restore dialogs.** (#1489)
- **Removed retired words and controls from cockpit copy.** Eleven strings used old screen words, and three told you to use a **Deploy again** control that no longer exists. (#1331, #1469)
- **Made removal copy on Skills match what happens.** The Remove dialog and report state the real counts and next steps. (#1467)
- **Made Deploy-state, Skills, Repositories and Harness behave the same.** Row menus, blocked buttons and dialogs work the same way on all four screens. (#1465)
- **Made Deploy-state copy say what its controls and statuses do.** Dialog labels no longer use spaced capitals. (#1430, #1432)
- **Fixed gray blocks behind versions in warning and error boxes.** (#1428)
- **Stopped crafted inputs from stalling the server.** A long, crafted connect input or git origin can no longer stall the server. (#1377, #1412)
- **Named the Harness in the Delete skill dialog.** The dialog says where the skill stays and how to delete it there too. (#1410)
- **Showed a failed retry of an unfinished operation.** The target's pane shows a notice with the retry as its action. (#1405)
- **Fixed Update target when you edited a skill the new release drops.** The update removes that skill's copies and then finishes. (#1401)
- **Kept the Import local edits dialog open after a change.** A click outside no longer closes it once you changed a check. (#1345)
- **Stopped Harness git reads from hanging.** Each read now times out after 60 seconds and never asks for input. (#1330)
- **Showed a report row's redeploy as busy while it runs.** **Deploy {name} again** reads **Deploying…**, and the bulk deploy report can't be closed during that deploy. (#1329)

## v0.1.2 — 2026-09-30

### New Features
- **Added Import local edits on Deploy-state.** A Repository or the global target with skills reading **Local edits** offers **Import local edits…**. One dialog lists the skills, and each one you confirm lands in the Harness as a Pending proposal. Skills that would undo newer Harness changes stay unchecked, and refused skills say why and what to do next. (#1264)
- **Imported local edits from a single skill row.** A skill row reading **Local edits** offers **Import local edits…** in its ⋮ menu and opens the same dialog for that one skill. (#1274)
- **Placed target pane actions beside their reason.** **Retry** shows in the unfinished-operation notice, **Update target** sits beside Latest release, and the pane's main button follows the target's state. (#1273)
- **Showed the full notice per row in the bulk deploy report.** Each failed or attention row now says what happened, what was not installed and which control to use next, in the same words as the detail pane. (#1262)

### Bug Fixes
- **Made the remove check strict.** An unreadable or unknown answer from the remove check now shows as a failed check instead of passing as safe. (#1296)
- **Carried the full Octicons MIT licence text.** `THIRD-PARTY-NOTICES.md` now holds the licence itself, not a link. (#1297)

## v0.1.1 — 2026-09-27

### New Features
- **Unified every cockpit dialog.** All twelve dialogs share one header with a ✕ close control, and show `Cancel` before an action runs and `Close` once it has an outcome. (#1251)
- **Dropped the empty Pending proposal group from the Harness.** A Pending proposal stage with no rows no longer draws an empty line on the table. (#1248)
- **Explained each failed skill after an update.** The Update result lists the worst problems first and tells you, per skill, what went wrong and what to do next. (#1247)
- **Added a close control to outcome notices.** The Release published and Skill restored notices on the Harness can now be dismissed. (#1245)
- **Cleared the Inventory selection after a deploy.** Closing a deploy's Report empties the selection, so the bar no longer offers the same deploy again. (#1244)
- **Closed the detail pane on an outside click.** Clicking outside the pane closes it on Deploy-state, Inventory and Harness; clicking another row moves it. (#1243)
- **Simplified Harness headers and the newer-release line.** Headers no longer show a routine read age, and the release line now reads `New release available: <release>. N of M deployed skills changed.` (#1240)
- **Applied the Maestro logo.** The app header, favicon, README and GitHub assets now carry the same mark. (#1210)
- **Opened Import's new skill in the Harness.** A successful import closes the dialog, selects the new Pending proposal row and opens its detail pane. (#1203)
- **Opened the system folder chooser on Windows.** Browse now works on Windows as it already did on macOS. (#1200)

### Bug Fixes
- **Listed only truly new skills as new in an update.** The Update preview no longer shows skills the target's current release already had under "New in this release". (#1242)
- **Counted an update complete only when every tool has its copy.** A skill missing in one tool now leaves the update unfinished and offers **Retry update**. (#1238)
- **Refused a linked skill folder before an update runs.** Update stops before APM when a skill folder is a symlink, and names the linked path to remove. (#1227)
- **Read a released local copy as Behind, not Local edits.** A copy whose changes were imported and released now shows the right status on Deploy-state. (#1214)
- **Opened the right row from Repositories.** **View Deploy-state** now opens that repository's row with its detail pane. (#1211)
- **Kept table names readable on a narrow panel.** Secondary columns hide first, so the name column stays wide enough to read. (#1208)
- **Kept Harness facts readable at narrow widths.** Origin, Released and Branch no longer overlap on a small or zoomed screen. (#1207)
- **Softened page lines.** Panels and rows draw on quieter border colours, so floating layers stand out. (#1202)
- **Showed pre-releases in the README release badge.** The badge now finds `v0.1.0`. (#1195)

## v0.1.0 — 2026-09-26

First alpha release. Alpha: skills work today; hooks and MCP servers are not supported yet, and breaking changes can land between releases.

- **See every skill in one screen.** Maestro is a local web app that shows each skill you have, where every copy is deployed and which copies are behind.
- **Deploy and update skills.** Copy one skill at one released version into a project or your global folder, and update a target when the Harness has a newer release.
- **Share skills with your team through a Harness.** A Harness is a GitHub repository of shared skills. Import a skill you wrote, propose the change as a pull request, then publish a release.
- **Built on APM.** APM does the installing, pinning and tracking; Maestro reads its lockfiles and runs its commands.
- **Runs on your machine only.** The server listens on `127.0.0.1` and stores no tokens.
