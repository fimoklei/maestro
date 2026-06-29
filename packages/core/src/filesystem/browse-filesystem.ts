// Read-only directory browsing for the first-run path pickers (ADR-0009).
// Given a directory path, returns its immediate child directories — never file
// contents — bounded by a root ceiling (the user's home). The order is the one
// security.md mandates: normalize → realpath → assert inside the root, before
// any listing happens. `..` and symlink escapes collapse under realpath and are
// then caught by the root check (isWithinRoot). An empty path defaults to the
// root so the picker has a sensible starting point.
import { join } from "node:path";
import type { FileSystemPort } from "../registry/file-system";
import { isWithinRoot } from "./browse-path";

export type BrowseError = "outside-root" | "not-found" | "not-a-directory";

export type BrowseEntry = { name: string; path: string };

export type BrowseResult =
  | { ok: true; path: string; entries: BrowseEntry[] }
  | { ok: false; error: BrowseError };

export class BrowseFilesystem {
  private readonly fs: FileSystemPort;
  private readonly homeRoot: () => string;

  constructor(deps: { fs: FileSystemPort; homeRoot: () => string }) {
    this.fs = deps.fs;
    this.homeRoot = deps.homeRoot;
  }

  async browse(input: string): Promise<BrowseResult> {
    const requested = input.trim() === "" ? this.homeRoot() : input.trim();

    let real: string;
    let realRoot: string;
    try {
      real = await this.fs.realpath(requested);
      realRoot = await this.fs.realpath(this.homeRoot());
    } catch {
      return { ok: false, error: "not-found" };
    }

    // The ceiling check runs before any directory listing — info disclosure is
    // bounded to the user's own home, the only protection the Origin/Host guard
    // does not give (ADR-0009).
    if (!isWithinRoot(real, realRoot)) {
      return { ok: false, error: "outside-root" };
    }

    if (!(await this.fs.isDirectory(real))) {
      return { ok: false, error: "not-a-directory" };
    }

    // listDirectoryNames returns child directory names only (the Node adapter
    // filters non-directories and unresolved symlinks); sort for a stable picker.
    const names = await this.fs.listDirectoryNames(real);
    const entries = names
      .map((name) => ({ name, path: join(real, name) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { ok: true, path: real, entries };
  }
}
