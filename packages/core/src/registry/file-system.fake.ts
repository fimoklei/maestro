import type { FileStamp, FileSystemPort, RawDirEntry } from "./file-system";

type FakeSeed = {
  // Input path → canonical path. Self-mapped is a genuine directory, a
  // differing value a symlink.
  directories?: Record<string, string>;
  files?: Record<string, string>;
  // Link path → the file it points at.
  fileSymlinks?: Record<string, string>;
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
  private readonly fileSymlinks: Map<string, string>;
  private readonly listings: Map<string, string[]>;
  private readonly unreadable: Set<string>;
  private readonly racedAwayAsDirectory: Set<string>;
  private readonly danglingSymlinks: Set<string>;
  private readonly racedIntoExistence: Set<string>;
  private readonly unwritable: Set<string>;
  // A write counter stands in for the modification time.
  private readonly writes = new Map<string, number>();

  constructor(seed: FakeSeed = {}) {
    this.directories = new Map(Object.entries(seed.directories ?? {}));
    this.files = new Map(Object.entries(seed.files ?? {}));
    this.fileSymlinks = new Map(Object.entries(seed.fileSymlinks ?? {}));
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
    const target = this.fileSymlinks.get(path);
    if (target !== undefined && this.files.has(target)) {
      return target;
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

  // Like lstat: a link counts, whatever it points at.
  async exists(path: string): Promise<boolean> {
    return (
      this.directories.has(path) ||
      this.files.has(path) ||
      this.fileSymlinks.has(path) ||
      this.danglingSymlinks.has(path)
    );
  }

  async isFileEntry(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async stamp(path: string): Promise<FileStamp | null> {
    const contents = this.files.get(path);
    if (contents === undefined) {
      return null;
    }
    return { modifiedMs: this.writes.get(path) ?? 0, size: contents.length };
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
    this.setFile(path, contents);
  }

  async createNewFile(path: string, contents: string): Promise<boolean> {
    if (this.unwritable.has(path)) {
      throw new Error(`EACCES: permission denied, open '${path}'`);
    }
    if (this.racedIntoExistence.has(path) || (await this.exists(path))) {
      return false;
    }
    this.setFile(path, contents);
    return true;
  }

  private setFile(path: string, contents: string): void {
    this.writes.set(path, (this.writes.get(path) ?? 0) + 1);
    this.files.set(path, contents);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
    this.fileSymlinks.delete(path);
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
