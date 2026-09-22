# #1044 — Folder chooser: Windows not yet measured, macOS time limit

ADR-0032 §4 makes the Windows invocation a design until it is measured, and
forbids its adapter until then. This file records the attempt and the ready
measurement, so the next attempt only has to run it.

## Status

**Not measured.** No Windows machine was available. The fallback, a one-off
workflow on `windows-latest`, was pushed as branch
`chore/measure-windows-chooser` on 2026-09-23 (run 35789907840). GitHub did not
start the job: *"recent account payments have failed or your spending limit
needs to be increased"*. The branch was deleted afterwards.

Consequence, per ADR-0032: Maestro builds no Windows adapter, and on Windows the
server reports no chooser, so **Browse** does not render there. The field takes
a typed or pasted path.

## The ready measurement

- `1044-windows-folder-chooser/measure.mjs` starts the designed call exactly as
  the adapter would: `execFile` of
  `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile
  -NonInteractive -STA -Command <constant script>`, the start folder in
  `MAESTRO_CHOOSER_START`. A second process screenshots the desktop, lists the
  windows and the foreground window, then sends Enter or Escape.
- `1044-windows-folder-chooser/measure-workflow.yml` runs it on
  `windows-latest` and uploads `shots/` (screenshots plus `results.json`).
  Copy it to `.github/workflows/` on a throwaway branch and push.

It answers, per case (picked, cancelled, start folder missing, killed at a
timeout; with and without a `TopMost` owner form; `windowsHide` on and off):

1. Does the dialog show at all under `-NonInteractive`, and with
   `windowsHide: true`?
2. Is it in front of other windows?
3. What do stdout and the exit code carry on a pick and on a cancel?
4. Does a non-ASCII path survive stdout (`[Console]::OutputEncoding` UTF-8)?
5. Does killing the process close the window?

#1044 stays open for its two Windows criteria until this runs. Record the
answers here, amend ADR-0032 §4 where they disagree, then write the
adapter against the `FolderChooserPort` in
`packages/core/src/folder-chooser/`.

## macOS: the time limit closes the chooser

Measured 2026-09-23 on macOS 26.6.2: `execFile("/usr/bin/osascript", ["-e",
<the adapter's script>, "$HOME/Projects"], { timeout: 3000 })` answered after
3008 ms with `killed: true`, exit code `null` and empty stdout and stderr, and
`pgrep` found no `osascript` left. `choose folder` runs inside `osascript`
itself (no `System Events`), so the kill takes the window with it; the adapter
reads that outcome as a cancel.
