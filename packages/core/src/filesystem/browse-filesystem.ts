// Read-only directory browsing for the first-run path pickers (ADR-0009).
// Given a directory path, returns its immediate child directories — never file
// contents — bounded by a root ceiling (the user's home). The order is the one
// security.md mandates: normalize → realpath → assert inside the root, before
// any listing happens. `..` and symlink escapes collapse under realpath and are
// then caught by the root check (isWithinRoot). An empty path defaults to the
// root so the picker has a sensible starting point.
import { join, resolve } from "node:path";
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
    const rawRoot = this.homeRoot();
    const requested = input.trim() === "" ? rawRoot : input.trim();

    // Resolve the home ceiling first; it always exists, so this leaks nothing.
    let realRoot: string;
    try {
      realRoot = await this.fs.realpath(rawRoot);
    } catch {
      return { ok: false, error: "not-found" };
    }

    // Lexical ceiling check BEFORE probing the requested path. Collapsing `..`
    // and rejecting anything outside the root without touching disk stops the
    // endpoint leaking whether an *outside* path exists — realpath would throw
    // for a missing one and resolve a present one, telling them apart beyond the
    // ceiling (ADR-0009). Accept a path lexically inside either the raw or the
    // resolved home: the two differ when home sits under a symlinked prefix
    // (e.g. macOS /var -> /private/var), and the picker feeds back resolved
    // paths while a test or a user may pass the raw form.
    const normalized = resolve(requested);
    if (
      !isWithinRoot(normalized, realRoot) &&
      !isWithinRoot(normalized, rawRoot)
    ) {
      return { ok: false, error: "outside-root" };
    }

    // Now resolve symlinks. The path is lexically inside home, so a throw here
    // discloses only a missing entry within the ceiling — acceptable.
    let real: string;
    try {
      real = await this.fs.realpath(normalized);
    } catch {
      return { ok: false, error: "not-found" };
    }

    // A symlink lexically inside home but resolving outside is caught here.
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
