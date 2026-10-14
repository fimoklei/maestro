// Kept out of the build (tsconfig.build excludes *.fake.ts).
import type { FileSystemPort } from "../registry/file-system";
import type { CopyEntryFacts, CopyTreeFsPort, OpenFile } from "./copy-tree-fs";

type MemoryFile = { bytes: Buffer; executable: boolean; version: number };

// An in-memory copy tree: files, directories and symlinks keyed by absolute
// POSIX path. Tests write and edit it through the same port the adapters use.
export class InMemoryCopyTree implements CopyTreeFsPort {
  private readonly files = new Map<string, MemoryFile>();
  private readonly directories = new Set<string>();
  // Link path → the path it points at.
  private readonly symlinks = new Map<string, string>();
  private readonly unreadable = new Set<string>();
  private stagingCount = 0;
  private versionCounter = 0;

  // Test helpers: the copy's own edits and removals, as the user would make them.
  write(path: string, contents: string | Buffer): void {
    this.writeSync(path, Buffer.from(contents), false);
  }

  remove(path: string): void {
    const key = normalize(path);
    const within = (k: string) => k === key || isWithin(k, key);
    for (const k of [...this.files.keys()]) {
      if (within(k)) this.files.delete(k);
    }
    for (const k of [...this.directories]) {
      if (within(k)) this.directories.delete(k);
    }
    for (const k of [...this.symlinks.keys()]) {
      if (within(k)) this.symlinks.delete(k);
    }
  }

  // Test edits: a link at `path` to `target`, which may not exist.
  symlink(path: string, target: string): void {
    this.ensureParents(path);
    this.symlinks.set(normalize(path), normalize(target));
  }

  // Listing and opening of `path` are refused from now on, as an EACCES would.
  setUnreadable(path: string): void {
    this.unreadable.add(normalize(path));
  }

  // The same tree behind `FileSystemPort`, so code reading through either
  // port sees one disk.
  fileSystem(): FileSystemPort {
    const resolved = async (path: string) => {
      const real = await this.realpath(path);
      if (real === null) {
        throw new Error(`ENOENT: no such file or directory, '${path}'`);
      }
      return real;
    };
    return {
      realpath: resolved,
      isDirectory: async (path) =>
        this.directories.has((await this.realpath(path)) ?? ""),
      isDirectoryEntry: async (path) => this.directories.has(normalize(path)),
      exists: async (path) => (await this.describe(path)) !== null,
      isFileEntry: async (path) => this.files.has(normalize(path)),
      readFile: async (path) => {
        const real = await this.realpath(path);
        return real === null
          ? null
          : (this.files.get(real)?.bytes.toString("utf8") ?? null);
      },
      listRawEntries: async (path) => {
        const key = normalize(path);
        if (this.unreadable.has(key)) {
          throw new Error(`EACCES: permission denied, scandir '${path}'`);
        }
        return ((await this.listNames(key)) ?? []).map((name) => {
          const child = key === "/" ? `/${name}` : `${key}/${name}`;
          return {
            name,
            isDirectory: this.directories.has(child),
            isSymlink: this.symlinks.has(child),
          };
        });
      },
      writeFile: async (path, contents) => this.write(path, contents),
      createNewFile: async (path, contents) => {
        if ((await this.describe(path)) !== null) {
          return false;
        }
        this.write(path, contents);
        return true;
      },
      remove: async (path) => this.remove(path),
      ensureDir: async (path) => this.makeDirSync(path),
    };
  }

  // Test reads: what the copy holds now, for building expectations.
  filePaths(): string[] {
    return [...this.files.keys()].sort();
  }

  read(path: string): Buffer | undefined {
    return this.files.get(normalize(path))?.bytes;
  }

  async describe(path: string): Promise<CopyEntryFacts | null> {
    const key = normalize(path);
    const file = this.files.get(key);
    if (file !== undefined) {
      return {
        kind: "file",
        size: file.bytes.length,
        hardLinks: 1,
        executable: file.executable,
        identity: `mem:${key}:${file.version}`,
      };
    }
    if (this.directories.has(key)) {
      return factsOfKind("directory", key);
    }
    if (this.symlinks.has(key)) {
      return factsOfKind("symlink", key);
    }
    return null;
  }

  async listNames(path: string): Promise<string[] | null> {
    const key = normalize(path);
    if (this.unreadable.has(key) || !this.directories.has(key)) {
      return null;
    }
    const names = new Set<string>();
    for (const child of [
      ...this.files.keys(),
      ...this.directories,
      ...this.symlinks.keys(),
    ]) {
      if (isWithin(child, key)) {
        names.add(
          child.slice(key === "/" ? 1 : key.length + 1).split("/")[0] ?? "",
        );
      }
    }
    return [...names].sort();
  }

  // Resolves a link in the final component only; null when it dangles.
  async realpath(path: string): Promise<string | null> {
    const key = normalize(path);
    const resolved = this.symlinks.get(key) ?? key;
    return this.files.has(resolved) || this.directories.has(resolved)
      ? resolved
      : null;
  }

  async createStagingDir(parent: string): Promise<string> {
    this.stagingCount += 1;
    const dir = normalize(`${parent}/.maestro-copy-${this.stagingCount}`);
    this.makeDirSync(dir);
    return dir;
  }

  async makeDir(path: string): Promise<void> {
    this.makeDirSync(path);
  }

  async openFile(path: string): Promise<OpenFile | null> {
    const key = normalize(path);
    const file = this.files.get(key);
    if (file === undefined || this.unreadable.has(key)) {
      return null;
    }
    return {
      facts: async () => (await this.describe(key)) as CopyEntryFacts | null,
      read: async () => Buffer.from(file.bytes),
      close: async () => {},
    };
  }

  async writeFile(
    to: string,
    bytes: Buffer,
    executable: boolean,
  ): Promise<void> {
    this.writeSync(to, bytes, executable);
  }

  async movePath(from: string, to: string): Promise<void> {
    const source = normalize(from);
    const target = normalize(to);
    for (const [k, v] of [...this.files]) {
      if (k === source || isWithin(k, source)) {
        this.files.delete(k);
        this.files.set(target + k.slice(source.length), v);
      }
    }
    for (const k of [...this.directories]) {
      if (k === source || isWithin(k, source)) {
        this.directories.delete(k);
        this.directories.add(target + k.slice(source.length));
      }
    }
    for (const [k, v] of [...this.symlinks]) {
      if (k === source || isWithin(k, source)) {
        this.symlinks.delete(k);
        this.symlinks.set(target + k.slice(source.length), v);
      }
    }
  }

  async removePath(path: string): Promise<void> {
    this.remove(path);
  }

  private writeSync(path: string, bytes: Buffer, executable: boolean): void {
    const key = normalize(path);
    this.ensureParents(key);
    this.versionCounter += 1;
    this.files.set(key, { bytes, executable, version: this.versionCounter });
  }

  private makeDirSync(path: string): void {
    const key = normalize(path);
    this.ensureParents(key);
    this.directories.add(key);
  }

  private ensureParents(path: string): void {
    const parts = normalize(path).split("/").filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      this.directories.add(`/${parts.slice(0, i).join("/")}`);
    }
  }
}

function factsOfKind(
  kind: "directory" | "symlink",
  key: string,
): CopyEntryFacts {
  return {
    kind,
    size: 0,
    hardLinks: 1,
    executable: false,
    identity: `mem:${key}`,
  };
}

function normalize(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function isWithin(child: string, parent: string): boolean {
  return child.startsWith(parent === "/" ? "/" : `${parent}/`);
}
