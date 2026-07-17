// Read-only directory browsing for the first-run path pickers (ADR-0009).
// Given a directory path, returns its immediate child directories — never file
// contents — bounded by a root ceiling (the user's home). The order is the one
// security.md mandates: normalize → realpath → assert inside the root, before
// any listing happens. `..` and symlink escapes collapse under realpath and are
// then caught by the root check (isWithinRoot). An empty path defaults to the
// root so the picker has a sensible starting point.
import { dirname, join, relative, resolve, sep } from "node:path";
import type { FileSystemPort } from "../registry/file-system";
import { isWithinRoot } from "./browse-path";

export type BrowseError =
  | "outside-root"
  | "not-found"
  | "not-a-directory"
  | "unreadable";

// Facts about a browse entry — never a badge decision. The client decides
// what to badge per mode (register vs. connect); the server only reports
// what it observed on disk (issue #150).
export type BrowseEntryFacts = {
  isGitRepo: boolean;
  hasSkillsSubdir: boolean;
};

export type BrowseEntry = {
  name: string;
  path: string;
  facts: BrowseEntryFacts;
};

// One clickable breadcrumb segment. The home-root segment is named "~" (the
// file-browser convention); every other segment carries its directory name.
export type BrowseCrumb = { name: string; path: string };

// `parent` is absent at the home ceiling — the client treats "no parent" as
// "up is disabled" and never derives a parent (or breadcrumbs) from the path
// string itself; all path math stays server-side (issue #146).
export type BrowseResult =
  | {
      ok: true;
      path: string;
      parent?: string;
      breadcrumbs: BrowseCrumb[];
      entries: BrowseEntry[];
    }
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
    // A real directory the user can select may still be unreadable (permission
    // denied under home, e.g. parts of ~/Library), which rejects here — map it
    // to a typed error so the route answers a controlled status, never a 500.
    let names: string[];
    try {
      names = await this.fs.listDirectoryNames(real);
    } catch {
      return { ok: false, error: "unreadable" };
    }
    // Facts cost a couple of extra syscalls per entry (a repo directory and
    // a permission-denied listing are both bounded in size — see ADR-0009's
    // amendment); enrichment is always on rather than opt-in, and stays
    // parallel per entry so the picker isn't gated on a slow serial scan.
    const entries = await Promise.all(
      names
        .map((name) => ({ name, path: join(real, name) }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (entry) => ({
          ...entry,
          facts: {
            isGitRepo: await this.fs.exists(join(entry.path, ".git")),
            hasSkillsSubdir: await this.fs.isDirectory(
              join(entry.path, "skills"),
            ),
          },
        })),
    );

    // Parent and breadcrumbs derive from the *resolved* path — a symlinked
    // request must not produce an "up" that lands on a non-existent path. Both
    // stop at the ceiling: no parent field there, and the crumb trail starts at
    // the "~" home segment.
    const crumbSegments =
      real === realRoot ? [] : relative(realRoot, real).split(sep);
    const breadcrumbs: BrowseCrumb[] = [{ name: "~", path: realRoot }];
    let crumbPath = realRoot;
    for (const segment of crumbSegments) {
      crumbPath = join(crumbPath, segment);
      breadcrumbs.push({ name: segment, path: crumbPath });
    }

    if (real === realRoot) {
      return { ok: true, path: real, breadcrumbs, entries };
    }
    return {
      ok: true,
      path: real,
      parent: dirname(real),
      breadcrumbs,
      entries,
    };
  }
}
