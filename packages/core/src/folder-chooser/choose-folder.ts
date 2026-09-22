import type { FileSystemPort } from "../registry/file-system";
import { validateRepoPath } from "../registry/repo-path";
import type { FolderChooserPort } from "./folder-chooser-port";

export type ChooseFolderError =
  | "chooser-unavailable"
  | "chooser-busy"
  | "chooser-failed";

/** `path: null` is nothing picked: a cancel, or the time limit. */
export type ChooseFolderResult =
  | { ok: true; path: string | null }
  | { ok: false; error: ChooseFolderError };

// Opens the system folder chooser, one at a time, and checks its answer exactly
// as a typed path is checked (ADR-0032 §6). `chooser` is null on a platform
// with no helper.
export class ChooseFolder {
  private readonly chooser: FolderChooserPort | null;
  private readonly fs: FileSystemPort;
  private readonly homeRoot: () => string;
  private open = false;

  constructor(deps: {
    chooser: FolderChooserPort | null;
    fs: FileSystemPort;
    homeRoot: () => string;
  }) {
    this.chooser = deps.chooser;
    this.fs = deps.fs;
    this.homeRoot = deps.homeRoot;
  }

  async available(): Promise<boolean> {
    return this.chooser !== null && (await this.chooser.isPresent());
  }

  async choose(start: string): Promise<ChooseFolderResult> {
    if (this.open) {
      return { ok: false, error: "chooser-busy" };
    }
    this.open = true;
    try {
      if (this.chooser === null || !(await this.chooser.isPresent())) {
        return { ok: false, error: "chooser-unavailable" };
      }
      const answer = await this.chooser.open(await this.startFolder(start));
      if (answer.kind === "cancelled") {
        return { ok: true, path: null };
      }
      if (answer.kind === "failed") {
        return { ok: false, error: "chooser-failed" };
      }
      // One line, an absolute path; nothing else in the output crosses.
      const lines = answer.output.split(/\r?\n/).filter((line) => line !== "");
      if (lines.length !== 1) {
        return { ok: false, error: "chooser-failed" };
      }
      const checked = await validateRepoPath(lines[0] ?? "", this.fs);
      return checked.ok
        ? { ok: true, path: checked.path }
        : { ok: false, error: "chooser-failed" };
    } finally {
      this.open = false;
    }
  }

  // The field's current value when it names a folder, else the home folder.
  private async startFolder(start: string): Promise<string> {
    const checked = await validateRepoPath(start, this.fs);
    return checked.ok ? checked.path : this.homeRoot();
  }
}
