# ADR-0032 — Browse opens the operating system's folder chooser

- **Status:** Accepted — supersedes ADR-0009
- **Date:** 2026-09-20 (decided in issue #1014; the form it serves in #1009 and
  #1013; macOS measured on 26.6.2; Windows measured 2026-09-26 on Windows
  Server 2025 with Windows PowerShell 5.1, #1071)

## Context

Four places ask the reader for one folder: Register repository, the connect
gate, the clone folder and Import skill. Each is a `Folder path` field with a
**Browse** button (#1009, #1013). A browser never gives a page the absolute
path of a picked folder — `<input webkitdirectory>` and `showDirectoryPicker()`
both hide where the folder sits — and that path is the one thing Maestro needs.
Only a local process may see it.

`security.md` admitted three executables, `apm`, `git` and `gh`, and required an
ADR for a fourth. The chooser needs a helper per platform.

Measured on macOS 26.6.2: `/usr/bin/osascript` running `choose folder` opens on
top of the reader's windows with no `activate` line and no Automation
permission; `with invisibles` shows dotfolders; `default location` opens it on a
given folder.

## Decision

**Browse asks Maestro's own server to open the operating system's folder
chooser. The chooser is an optional capability, run by one fixed helper per
platform.**

1. **The bound.** Maestro starts three product executables — `apm`, `git`, `gh`
   — plus one folder-chooser helper per platform: `/usr/bin/osascript` on macOS
   and Windows PowerShell on Windows. The helper is started by absolute system
   path, never through `PATH`, and does one thing: let the reader pick one
   folder and print its path. Any other program, and any other use of these two,
   takes a new ADR.
2. **The script is a constant.** No input ever becomes script text. The start
   folder — the path already in the field, which came from the browser — goes in
   as data: an `argv` item read by `on run argv` on macOS, the environment
   variable `MAESTRO_CHOOSER_START` on Windows. A start folder that does not
   exist falls back to the home folder.
3. **macOS.** `execFile("/usr/bin/osascript", ["-e", <script>, <start>])`, where
   the script is `POSIX path of (choose folder … default location … with
   invisibles)`. No `System Events`, so macOS asks the reader for no permission.
4. **Windows.** `powershell.exe` from the system directory with `-NoProfile
   -NonInteractive -STA -Command <script>`; the script opens
   `System.Windows.Forms.FolderBrowserDialog` over a `TopMost` owner form and
   writes the pick as UTF-8. The measurement confirmed this design: the dialog
   shows in front under `-NonInteractive` and `windowsHide`, a pick exits 0
   with the path on stdout, a cancel exits 2 with nothing, and a non-ASCII path
   survives.
5. **Hidden folders differ per platform.** macOS always shows them. The Windows
   chooser follows the reader's Explorer setting and cannot be forced. The field
   takes a typed or pasted path everywhere, so no place depends on the chooser.
6. **The answer is untrusted input.** The helper may return one line: an
   absolute path. It passes exactly the checks a typed path passes, and nothing
   else in the helper's output crosses (ADR-0018). A cancelled chooser
   (`osascript` error −128, PowerShell exit 2) means *nothing picked*: no notice, the field
   unchanged. Every other failure is stated from the server's own message table.
7. **No helper, no button.** The server says whether a chooser exists: a
   supported platform and the helper present at its fixed path. Where it does
   not — Linux, or a missing helper — **Browse** is not rendered and the field
   stands alone.
8. **While it is open.** **Browse** shows its spinner and is locked; the field
   stays typeable. One chooser at a time. After 5 minutes Maestro closes it, and
   that counts as a cancel.
9. **The route is a write.** It opens a window on the reader's machine, so it is
   a non-`GET` method behind the origin-host guard.

## Consequences

- `security.md` names the new bound in place of "three executables, no fourth".
- The helper sits behind a port in `core` with one adapter per platform
  (ADR-0002); tests drive the adapter with controlled process outcomes and never
  open a real chooser.
- The four-mode browse dialog, its listing route and its hidden-items toggle
  retire (#1013).

## Rejected alternatives

- **The in-app folder browser we had.** Four modes, a filter, a hidden-items
  toggle and a listing route, for a value the reader often has in a terminal
  already (#1009).
- **The browser's own pickers.** Neither yields an absolute path.
- **Opening the chooser through `System Events`.** It forces the window to the
  front, which the measurement showed is not needed, and costs the reader a
  one-time Automation permission prompt.
- **The start folder inside the script text.** One quote in a path becomes
  AppleScript or PowerShell.
- **An owned folder listing for Windows alone**, to show hidden folders. A
  second picker for one platform's setting; the pasted path already covers it.
- **A Linux helper** (`zenity`, `kdialog`). Neither is present by default, and
  each would be one more executable to admit.
