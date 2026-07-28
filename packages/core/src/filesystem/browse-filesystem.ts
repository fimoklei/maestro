// Read-only directory browsing for the first-run path pickers (ADR-0009). Every
// path — the browsed one and each entry — runs normalize → realpath → assert
// inside the home ceiling, in that order (security.md, #148).
import { dirname, join, relative, resolve, sep } from "node:path";
import type { FileSystemPort, RawDirEntry } from "../registry/file-system";
import { isWithinRoot } from "./browse-path";

export type BrowseError =
  | "outside-root"
  | "not-found"
  | "not-a-directory"
  | "unreadable";

// Observations, never badge decisions — the client badges per mode (#150).
export type BrowseEntryFacts = {
  isGitRepo: boolean;
  hasSkillsSubdir: boolean;
};

export type BrowseEntry = {
  name: string;
  path: string;
  // A pure string check, never a filesystem fact: one response shape serves
  // both states of the dialog's show-hidden toggle (#148).
  isHidden: boolean;
  isSymlink: boolean;
  facts: BrowseEntryFacts;
};

export type BrowseCrumb = { name: string; path: string };

// `parent` is absent at the home ceiling. All path math stays server-side —
// the client never derives a parent or a crumb from the string (#146).
type BrowseResult =
  | {
      ok: true;
      path: string;
      parent?: string;
      breadcrumbs: BrowseCrumb[];
      entries: BrowseEntry[];
    }
  | { ok: false; error: BrowseError };

// Bound by both the route and the client, so a field added above either reaches
// both or fails to compile (#156).
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

    // The home ceiling always exists, so resolving it leaks nothing.
    let realRoot: string;
    try {
      realRoot = await this.fs.realpath(rawRoot);
    } catch {
      return { ok: false, error: "not-found" };
    }

    // Lexical check BEFORE touching disk, so the endpoint cannot leak whether an
    // outside path exists (ADR-0009). Raw and resolved home both count: they
    // differ under a symlinked prefix (macOS /var -> /private/var).
    const normalized = resolve(requested);
    if (
      !isWithinRoot(normalized, realRoot) &&
      !isWithinRoot(normalized, rawRoot)
    ) {
      return { ok: false, error: "outside-root" };
    }

    // Lexically inside home already, so a throw here discloses only a missing
    // entry within the ceiling.
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

    // lstat, not stat: `real` is canonical and ceiling-checked, so following one
    // more hop would list a symlink swapped in since that check (#160).
    if (!(await this.fs.isDirectoryEntry(real))) {
      return { ok: false, error: "not-a-directory" };
    }

    // Unfiltered, unlike listDirectoryNames — that is what lets a symlinked
    // directory reach the listing at all (#148).
    let rawEntries: RawDirEntry[];
    try {
      rawEntries = await this.fs.listRawEntries(real);
    } catch {
      return { ok: false, error: "unreadable" };
    }

    // The ceiling check comes before the type probe, so an out-of-ceiling target
    // is never stat'd — not even to discard the result (ADR-0009, #160).
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
          if (!(await this.fs.isDirectoryEntry(target))) {
            return null; // symlink to a file, or something else entirely
          }
          return { name: raw.name, path, isSymlink: true };
        }),
      )
    ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    classified.sort((a, b) => a.name.localeCompare(b.name));

    // Re-checked against the point of use: an entry genuine at classification
    // could since have been swapped for a symlink out of home. A symlink entry
    // is skipped — probing it would reopen the ceiling window (#150).
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

    // From the resolved path: a symlinked request must not produce an "up" that
    // lands on a non-existent one.
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
