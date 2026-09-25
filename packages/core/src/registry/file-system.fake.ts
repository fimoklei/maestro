// Kept out of the build (tsconfig.build excludes *.fake.ts).
import type { FileSystemPort, RawDirEntry } from "./file-system";

type FakeSeed = {
  // Input path → canonical path. Self-mapped is a genuine directory, a
  // differing value a symlink.
  directories?: Record<string, string>;
  files?: Record<string, string>;
  listings?: Record<string, string[]>;
  // Reject when listed.
  unreadable?: string[];
  // A directory when listed, no longer one on the isDirectoryEntry recheck.
  racedAwayAsDirectory?: string[];
  danglingSymlinks?: string[];
  // Absent to exists(), yet taken for an exclusive create.
  racedIntoExistence?: string[];
  unwritable?: string[];
};

export class InMemoryFileSystem implements FileSystemPort {
  private readonly directories: Map<string, string>;
  private readonly files: Map<string, string>;
  private readonly listings: Map<string, string[]>;
  private readonly unreadable: Set<string>;
  private readonly racedAwayAsDirectory: Set<string>;
  private readonly danglingSymlinks: Set<string>;
  private readonly racedIntoExistence: Set<string>;
  private readonly unwritable: Set<string>;

  constructor(seed: FakeSeed = {}) {
    this.directories = new Map(Object.entries(seed.directories ?? {}));
    this.files = new Map(Object.entries(seed.files ?? {}));
    this.listings = new Map(Object.entries(seed.listings ?? {}));
    this.unreadable = new Set(seed.unreadable ?? []);
    this.racedAwayAsDirectory = new Set(seed.racedAwayAsDirectory ?? []);
    this.danglingSymlinks = new Set(seed.danglingSymlinks ?? []);
    this.racedIntoExistence = new Set(seed.racedIntoExistence ?? []);
    this.unwritable = new Set(seed.unwritable ?? []);
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

  private isKnownDirectory(path: string): boolean {
    return this.directories.get(path) === path;
  }

  async isDirectory(path: string): Promise<boolean> {
    return this.isKnownDirectory(path);
  }

  async isDirectoryEntry(path: string): Promise<boolean> {
    if (this.racedAwayAsDirectory.has(path)) {
      return false;
    }
    return this.isKnownDirectory(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.isKnownDirectory(path) || this.files.has(path);
  }

  async isFileEntry(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

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

  async createNewFile(path: string, contents: string): Promise<boolean> {
    if (this.unwritable.has(path)) {
      throw new Error(`EACCES: permission denied, open '${path}'`);
    }
    if (this.racedIntoExistence.has(path) || (await this.exists(path))) {
      return false;
    }
    this.files.set(path, contents);
    return true;
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
    this.directories.delete(path);
    for (const known of [...this.files.keys(), ...this.directories.keys()]) {
      if (known.startsWith(`${path}/`)) {
        this.files.delete(known);
        this.directories.delete(known);
      }
    }
  }

  async ensureDir(path: string): Promise<void> {
    this.directories.set(path, path);
  }
}
