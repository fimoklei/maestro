import { win32 } from "node:path";
import { isFile } from "../filesystem/is-file";
import {
  CHOOSER_TIMEOUT_MS,
  type ChooserAnswer,
  type FolderChooserPort,
  type RunHelper,
} from "./folder-chooser-port";
import { runHelper } from "./run-helper";

const CANCELLED_EXIT = 2;

// A constant: the start folder arrives as $env:MAESTRO_CHOOSER_START, never as
// script text. The TopMost owner keeps the dialog in front of the browser.
const SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName System.Windows.Forms",
  "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false",
  "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
  "if ($env:MAESTRO_CHOOSER_START) { $dialog.SelectedPath = $env:MAESTRO_CHOOSER_START }",
  "$owner = New-Object System.Windows.Forms.Form",
  "$owner.TopMost = $true",
  "if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath); exit 0 }",
  `exit ${CANCELLED_EXIT}`,
].join("\n");

export class WindowsFolderChooser implements FolderChooserPort {
  private readonly run: RunHelper;
  private readonly helperExists: (path: string) => Promise<boolean>;
  private readonly powershell: string;

  constructor(deps?: {
    run?: RunHelper;
    helperExists?: (path: string) => Promise<boolean>;
    systemRoot?: string;
  }) {
    this.run = deps?.run ?? runHelper;
    this.helperExists = deps?.helperExists ?? isFile;
    const root = deps?.systemRoot ?? process.env.SystemRoot ?? "";
    this.powershell = win32.join(
      win32.isAbsolute(root) ? root : "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
  }

  isPresent(): Promise<boolean> {
    return this.helperExists(this.powershell);
  }

  async open(start: string): Promise<ChooserAnswer> {
    const outcome = await this.run(
      this.powershell,
      ["-NoProfile", "-NonInteractive", "-STA", "-Command", SCRIPT],
      {
        env: { ...process.env, MAESTRO_CHOOSER_START: start },
        timeout: CHOOSER_TIMEOUT_MS,
      },
    );
    if (outcome.killed || outcome.exitCode === CANCELLED_EXIT) {
      return { kind: "cancelled" };
    }
    if (outcome.exitCode === 0) {
      return { kind: "picked", output: outcome.stdout };
    }
    return { kind: "failed" };
  }
}
