import { isFile } from "../filesystem/is-file";
import {
  CHOOSER_TIMEOUT_MS,
  type ChooserAnswer,
  type FolderChooserPort,
  type RunHelper,
} from "./folder-chooser-port";
import { runHelper } from "./run-helper";

const OSASCRIPT = "/usr/bin/osascript";

// A constant: the start folder arrives as `item 1 of argv`, never as script
// text. No `System Events`, so macOS asks for no permission (ADR-0032 §3).
const SCRIPT = [
  "on run argv",
  "return POSIX path of (choose folder default location (POSIX file (item 1 of argv)) with invisibles)",
  "end run",
].join("\n");

// osascript's "User canceled" error number (ADR-0032 §6).
const USER_CANCELED = "(-128)";

export class MacosFolderChooser implements FolderChooserPort {
  private readonly run: RunHelper;
  private readonly helperExists: (path: string) => Promise<boolean>;

  constructor(deps?: {
    run?: RunHelper;
    helperExists?: (path: string) => Promise<boolean>;
  }) {
    this.run = deps?.run ?? runHelper;
    this.helperExists = deps?.helperExists ?? isFile;
  }

  isPresent(): Promise<boolean> {
    return this.helperExists(OSASCRIPT);
  }

  async open(start: string): Promise<ChooserAnswer> {
    const outcome = await this.run(OSASCRIPT, ["-e", SCRIPT, start], {
      env: process.env,
      timeout: CHOOSER_TIMEOUT_MS,
    });
    if (outcome.killed) {
      return { kind: "cancelled" };
    }
    if (outcome.exitCode === 0) {
      return { kind: "picked", output: outcome.stdout };
    }
    // stderr is read for this one marker and never passed on (ADR-0018).
    if (outcome.exitCode === 1 && outcome.stderr.includes(USER_CANCELED)) {
      return { kind: "cancelled" };
    }
    return { kind: "failed" };
  }
}
