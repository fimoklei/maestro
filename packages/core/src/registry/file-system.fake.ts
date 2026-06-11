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
};

export class InMemoryFileSystem implements FileSystemPort {
  private readonly directories: Map<string, string>;
  private readonly files: Map<string, string>;
  private readonly listings: Map<string, string[]>;

  constructor(seed: FakeSeed = {}) {
    this.directories = new Map(Object.entries(seed.directories ?? {}));
    this.files = new Map(Object.entries(seed.files ?? {}));
    this.listings = new Map(Object.entries(seed.listings ?? {}));
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

  async isDirectory(path: string): Promise<boolean> {
    return [...this.directories.values()].includes(path);
  }

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async listDirectoryNames(path: string): Promise<string[]> {
    return this.listings.get(path) ?? [];
  }

  async writeFile(path: string, contents: string): Promise<void> {
    this.files.set(path, contents);
  }

  // Records the directory as existing so a later isDirectory() sees it.
  async ensureDir(path: string): Promise<void> {
    this.directories.set(path, path);
  }
}
