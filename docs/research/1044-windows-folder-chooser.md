# #1044 — Folder chooser: Windows measurement, macOS time limit

ADR-0032 §4 made the Windows invocation a design until it was measured, and
forbade its adapter until then. This file records that measurement.

## Windows: measured

Run 2026-09-26 (#1071) as GitHub Actions run 36259005769 on `windows-latest`:
Windows Server 2025 (NT 10.0.26100), Windows PowerShell 5.1.26100.33438, CLR
4.0.30319.42000. An earlier attempt (run 35789907840, 2026-09-23) never started
over the account's billing limit.

**How.** `1044-windows-folder-chooser/measure.mjs` starts the designed call as
the adapter does: `execFile` of
`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile
-NonInteractive -STA -Command <constant script>`, the start folder in
`MAESTRO_CHOOSER_START`. A second process screenshots the desktop, reads the
foreground window, then sends Enter or Escape. To repeat it, copy
`1044-windows-folder-chooser/measure-workflow.yml` to `.github/workflows/` on a
throwaway branch named `chore/measure-windows-chooser` and push; the run
uploads `shots/` (screenshots plus `results.json`).

**Answers.** Start folder `C:\Users\runneradmin\maestro-chooser-ümlaut 日本`
unless noted.

| Case | Exit | stdout | Time |
|---|---|---|---|
| Enter, `TopMost` owner, `windowsHide: false` | 0 | the start folder | 10.1 s |
| Escape, owner, shown | 2 | empty | 9.1 s |
| Enter, owner, `windowsHide: true` | 0 | the start folder | 9.1 s |
| Enter, no owner, `windowsHide: true` | 0 | the start folder | 9.1 s |
| Enter, owner, start folder missing | 0 | `C:\Users\runneradmin\Desktop` | 9.1 s |
| No key, 12 s time limit | killed (`SIGTERM`) | empty | 12.0 s |

1. **Does it show?** Yes, in every case, including `-NonInteractive` and
   `windowsHide: true`. The screenshots show *Browse For Folder* with the start
   folder selected. The adapter sets `windowsHide`, so no console window
   opens behind the dialog.
2. **In front?** Yes: the foreground window was *Browse For Folder* in every
   case, with and without the owner form. The runner's desktop had no browser
   in front, so the adapter keeps the `TopMost` owner as the safer of the two.
3. **stdout and exit code.** A pick exits 0 with the bare path and no newline;
   a cancel exits 2 (the script's own `exit 2`) with empty stdout. stderr was
   empty throughout.
4. **Non-ASCII.** The path returned byte-exact as UTF-8 (`c3bc` for ü,
   `e697a5 e69cac` for 日本) with `[Console]::OutputEncoding` set to UTF-8.
5. **Does a kill close the window?** Not directly observable: the process
   window list never showed the dialog, even while it was up. The dialog runs
   inside the killed `powershell.exe` itself, so it ends with that process.
   The adapter reads the kill as a cancel.

A missing start folder opens on the Desktop. The adapter never sends one:
`ChooseFolder` falls back to the home folder first.

## macOS: the time limit closes the chooser

Measured 2026-09-23 on macOS 26.6.2: `execFile("/usr/bin/osascript", ["-e",
<the adapter's script>, "$HOME/Projects"], { timeout: 3000 })` answered after
3008 ms with `killed: true`, exit code `null` and empty stdout and stderr, and
`pgrep` found no `osascript` left. `choose folder` runs inside `osascript`
itself (no `System Events`), so the kill takes the window with it; the adapter
reads that outcome as a cancel.
