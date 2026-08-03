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
  // Directories that exist but reject when listed (permission denied).
  unreadable?: string[];
  // Models the TOCTOU race: a genuine directory when listed, no longer one on
  // the later isDirectoryEntry recheck (ADR-0009).
  racedAwayAsDirectory?: string[];
  // Full entry paths registered nowhere else: a Dirent reports the type, but
  // realpath() throws (#148).
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

  // Self-mapping is the seeding convention for a genuine directory. Narrower
  // than "appears in directories.values()", which a symlink target also does.
  private isKnownDirectory(path: string): boolean {
    return this.directories.get(path) === path;
  }

  async isDirectory(path: string): Promise<boolean> {
    return this.isKnownDirectory(path);
  }

  // The fake has no symlink concept, so the seed is the only way to model a
  // directory that stops being one between two checks.
  async isDirectoryEntry(path: string): Promise<boolean> {
    if (this.racedAwayAsDirectory.has(path)) {
      return false;
    }
    return this.isKnownDirectory(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.isKnownDirectory(path) || this.files.has(path);
  }

  // The fake has no symlink concept for a bare path, so a seeded file is the
  // only regular file it can model.
  async isFileEntry(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  // Type facts come from the same seed realpath reads: self-mapped is a
  // directory, a differing value is a symlink, anything else is neither.
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

  async ensureDir(path: string): Promise<void> {
    this.directories.set(path, path);
  }
}
