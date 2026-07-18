// Read-only directory browsing for the first-run path pickers (ADR-0009).
// Given a directory path, returns its immediate child directories — never file
// contents — bounded by a root ceiling (the user's home). The order is the one
// security.md mandates: normalize → realpath → assert inside the root, before
// any listing happens. `..` and symlink escapes collapse under realpath and are
// then caught by the root check (isWithinRoot). An empty path defaults to the
// root so the picker has a sensible starting point.
//
// A child that is itself a symlink is included when its target resolves
// inside the ceiling (tagged `isSymlink`) and dropped from the listing
// entirely when its target escapes it — the same normalize/realpath/assert
// order applied per entry, not just to the browsed path itself (issue #148).
// Every entry also carries `isHidden` (a dot-prefixed name); the dialog does
// the actual hidden-by-default filtering client-side from that flag.
import { dirname, join, relative, resolve, sep } from "node:path";
import type { FileSystemPort, RawDirEntry } from "../registry/file-system";
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
  // Dot-prefixed name — a pure string check, never a filesystem fact. The
  // dialog filters these out by default and offers a show-hidden toggle;
  // one response shape serves both toggle states (issue #148).
  isHidden: boolean;
  // True when this entry's own directory listing slot is a symlink (its
  // target, not this flag, decided whether it was included at all — see the
  // classification pass below). Never set for a plain directory.
  isSymlink: boolean;
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

// What a successful browse puts on the wire: the result above without its `ok`
// tag, which the transport carries as a status code instead. The route binds
// its response to this and the client reads it, so a field added above either
// reaches both or fails to compile (issue #156).
export type BrowseSuccess = Omit<Extract<BrowseResult, { ok: true }>, "ok">;

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

    // listRawEntries is unfiltered — files, directories, and symlinks alike —
    // unlike listDirectoryNames, which the Node adapter already narrows to
    // real (non-symlink) directories. The unfiltered list is what lets a
    // symlinked directory reach the listing at all (issue #148); a locked
    // directory rejects here with a typed error, never a 500. Each entry
    // already carries its dirent-level type facts from that one read, so a
    // plain file never needs a separate probe to rule it out below.
    let rawEntries: RawDirEntry[];
    try {
      rawEntries = await this.fs.listRawEntries(real);
    } catch {
      return { ok: false, error: "unreadable" };
    }

    // Classify each raw entry: a genuine directory (isDirectory true) is
    // included outright, no further disk access needed. A plain file
    // (neither isDirectory nor isSymlink) is dropped immediately, same as
    // before — nothing to resolve. Only a symlink is worth the extra work:
    // resolve it, assert the *resolved* target is inside the home ceiling
    // BEFORE touching it any further, then confirm it is a directory —
    // mirroring the endpoint's own normalize -> realpath -> assert-inside-
    // root order (ADR-0009). Checking the ceiling before isDirectory means an
    // out-of-ceiling target is never stat'd, not even to immediately discard
    // the result. A symlink whose target is missing, escapes the ceiling, or
    // is not a directory is dropped here and never reaches the client.
    const classified = (
      await Promise.all(
        rawEntries.map(async (raw) => {
          const path = join(real, raw.name);
          if (raw.isDirectory) {
            return { name: raw.name, path, isSymlink: false };
          }
          if (!raw.isSymlink) {
            return null; // a plain file — never worth resolving
          }
          let target: string;
          try {
            target = await this.fs.realpath(path);
          } catch {
            return null; // broken / dangling symlink
          }
          if (!isWithinRoot(target, realRoot)) {
            return null; // symlink escapes the ceiling — never shown, never stat'd
          }
          if (!(await this.fs.isDirectory(target))) {
            return null; // symlink to a file, or something else entirely
          }
          return { name: raw.name, path, isSymlink: true };
        }),
      )
    ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    classified.sort((a, b) => a.name.localeCompare(b.name));

    // Facts cost a couple of extra syscalls per entry (a repo directory and
    // a permission-denied listing are both bounded in size — see ADR-0009's
    // amendment); enrichment is always on rather than opt-in, and stays
    // parallel per entry so the picker isn't gated on a slow serial scan.
    //
    // Neither probe follows a symlink to a target outside the home ceiling:
    // `exists` never follows the final symlink (Node adapter uses lstat), and
    // `hasSkillsSubdir` reuses listDirectoryNames rather than isDirectory —
    // the same dirent-based check that already excludes symlinked entries
    // from a directory's own listing — so a "skills" symlink pointing outside
    // home is invisible here too, not silently resolved and disclosed.
    //
    // A plain-directory entry was genuine when classified above, but a
    // concurrent process with write access to `real` could since have
    // swapped it for a symlink out of home (a TOCTOU race — Codex review,
    // #150). isDirectoryEntry is re-checked immediately before probing each
    // entry, right up against the point of use, to shrink that window as far
    // as Node's fs/promises API allows without O_NOFOLLOW file descriptors;
    // on a lost race the entry reports no facts rather than resolving
    // anything through the swapped-in symlink. A symlink entry never reaches
    // this probe at all — it already required following one symlink to
    // classify; probing its resolved target's own children would reopen a
    // fresh, unvalidated ceiling window one hop deeper, so it always reports
    // no facts and shows only the "↳ symlink" tag (issue #148).
    const entries: BrowseEntry[] = await Promise.all(
      classified.map(async (entry) => {
        const isHidden = entry.name.startsWith(".");
        if (entry.isSymlink || !(await this.fs.isDirectoryEntry(entry.path))) {
          return {
            ...entry,
            isHidden,
            facts: { isGitRepo: false, hasSkillsSubdir: false },
          };
        }
        const [isGitRepo, children] = await Promise.all([
          this.fs.exists(join(entry.path, ".git")),
          this.fs.listDirectoryNames(entry.path).catch(() => [] as string[]),
        ]);
        return {
          ...entry,
          isHidden,
          facts: { isGitRepo, hasSkillsSubdir: children.includes("skills") },
        };
      }),
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
