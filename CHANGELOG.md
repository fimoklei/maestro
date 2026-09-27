# Changelog

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
