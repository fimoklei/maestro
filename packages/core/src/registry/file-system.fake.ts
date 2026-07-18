// In-memory FileSystemPort for unit tests: real Maps, no disk. Kept out of the
// build (tsconfig.build excludes *.fake.ts) but typechecked like any source.
import type { FileSystemPort } from "./file-system";

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
};

export class InMemoryFileSystem implements FileSystemPort {
  private readonly directories: Map<string, string>;
  private readonly files: Map<string, string>;
  private readonly listings: Map<string, string[]>;
  private readonly unreadable: Set<string>;
  private readonly racedAwayAsDirectory: Set<string>;

  constructor(seed: FakeSeed = {}) {
    this.directories = new Map(Object.entries(seed.directories ?? {}));
    this.files = new Map(Object.entries(seed.files ?? {}));
    this.listings = new Map(Object.entries(seed.listings ?? {}));
    this.unreadable = new Set(seed.unreadable ?? []);
    this.racedAwayAsDirectory = new Set(seed.racedAwayAsDirectory ?? []);
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

  // The fake has no separate "raw" store: a seed's `listings` entry already
  // names exactly what a test wants discoverable at that path, whether it
  // classifies as a plain directory or (via a `directories` alias pointing
  // elsewhere) a symlink — same source, so this delegates outright rather
  // than repeating the read.
  async listAllNames(path: string): Promise<string[]> {
    return this.listDirectoryNames(path);
  }

  async writeFile(path: string, contents: string): Promise<void> {
    this.files.set(path, contents);
  }

  // Records the directory as existing so a later isDirectory() sees it.
  async ensureDir(path: string): Promise<void> {
    this.directories.set(path, path);
  }
}
