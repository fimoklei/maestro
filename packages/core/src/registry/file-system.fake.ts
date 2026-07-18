// In-memory FileSystemPort for unit tests: real Maps, no disk. Kept out of the
// build (tsconfig.build excludes *.fake.ts) but typechecked like any source.
import type { FileSystemPort, RawDirEntry } from "./file-system";

type FakeSeed = {
  // Maps an input path to the canonical path realpath should return.
  directories?: Record<string, string>;
  // Paths that exist but are not directories (e.g. files).
  files?: Record<string, string>;
  // Maps a directory path to the entry names directly inside it.
  listings?: Record<string, string[]>;
  // Directories that exist but reject when listed (e.g. permission denied),
  // so callers can exercise the unreadable-directory path.
  unreadable?: string[];
  // Paths that were a genuine directory when first listed but no longer
  // report as one on a later isDirectoryEntry recheck — models a TOCTOU
  // race where a concurrent process swaps the directory for a symlink
  // between listing and probing it (browse-filesystem.ts, ADR-0009).
  racedAwayAsDirectory?: string[];
  // Full entry paths (parent + name) that report `isSymlink: true` from
  // listRawEntries but are not registered in `directories`/`files` at all —
  // models a broken/dangling symlink: real, a Dirent still reports its type,
  // but realpath() on it throws (browse-filesystem.ts, issue #148).
  danglingSymlinks?: string[];
};

export class InMemoryFileSystem implements FileSystemPort {
  private readonly directories: Map<string, string>;
  private readonly files: Map<string, string>;
  private readonly listings: Map<string, string[]>;
  private readonly unreadable: Set<string>;
  private readonly racedAwayAsDirectory: Set<string>;
  private readonly danglingSymlinks: Set<string>;

  constructor(seed: FakeSeed = {}) {
    this.directories = new Map(Object.entries(seed.directories ?? {}));
    this.files = new Map(Object.entries(seed.files ?? {}));
    this.listings = new Map(Object.entries(seed.listings ?? {}));
    this.unreadable = new Set(seed.unreadable ?? []);
    this.racedAwayAsDirectory = new Set(seed.racedAwayAsDirectory ?? []);
    this.danglingSymlinks = new Set(seed.danglingSymlinks ?? []);
  }

  async realpath(path: string): Promise<string> {
    const dir = this.directories.get(path);
    if (dir !== undefined) {
      return dir;
    }
    if (this.files.has(path)) {
      return path;
    }
    throw new Error(`ENOENT: no such file or directory, realpath '${path}'`);
  }

  // A path is a known directory when it resolves to itself — the seeding
  // convention every test follows for a genuine directory (e.g.
  // `"/home/user/dev": "/home/user/dev"`). This is deliberately narrower than
  // "appears anywhere in directories.values()": a symlink alias's resolution
  // target (e.g. a symlink pointing at a *file*) also shows up as a value,
  // but is never itself self-mapped, so it correctly reads as "not a
  // directory" here.
  private isKnownDirectory(path: string): boolean {
    return this.directories.get(path) === path;
  }

  async isDirectory(path: string): Promise<boolean> {
    return this.isKnownDirectory(path);
  }

  // Matches isDirectory unless the path was seeded as raced away — the fake
  // has no real symlink concept, so that seed is the only way to model a
  // directory no longer being one by the time of a second check.
  async isDirectoryEntry(path: string): Promise<boolean> {
    if (this.racedAwayAsDirectory.has(path)) {
      return false;
    }
    return this.isKnownDirectory(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.isKnownDirectory(path) || this.files.has(path);
  }

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async listDirectoryNames(path: string): Promise<string[]> {
    if (this.unreadable.has(path)) {
      throw new Error(`EACCES: permission denied, scandir '${path}'`);
    }
    return this.listings.get(path) ?? [];
  }

  // Derives each name's type facts from the same seed data realpath/isDirectory
  // already read — a genuine directory is self-mapped, a symlink is a
  // `directories` key whose value differs, and `danglingSymlinks` covers the
  // one shape neither of those can express (a symlink registered nowhere,
  // whose realpath throws). Anything else (a plain file, or a name with no
  // registration at all) reports as neither, matching how a real Dirent
  // never marks a regular file as a symlink or a directory.
  async listRawEntries(path: string): Promise<RawDirEntry[]> {
    if (this.unreadable.has(path)) {
      throw new Error(`EACCES: permission denied, scandir '${path}'`);
    }
    const names = this.listings.get(path) ?? [];
    return names.map((name) => {
      const entryPath = `${path}/${name}`;
      if (this.danglingSymlinks.has(entryPath)) {
        return { name, isDirectory: false, isSymlink: true };
      }
      const target = this.directories.get(entryPath);
      if (target === undefined) {
        return { name, isDirectory: false, isSymlink: false };
      }
      return {
        name,
        isDirectory: target === entryPath,
        isSymlink: target !== entryPath,
      };
    });
  }

  async writeFile(path: string, contents: string): Promise<void> {
    this.files.set(path, contents);
  }

  // Records the directory as existing so a later isDirectory() sees it.
  async ensureDir(path: string): Promise<void> {
    this.directories.set(path, path);
  }
}
