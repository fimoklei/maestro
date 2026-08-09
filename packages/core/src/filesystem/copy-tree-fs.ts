// The filesystem boundary for the bounded skill-folder copy — link counts, file
// kinds and a staging directory, which FileSystemPort has no other caller for.
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { join } from "node:path";

export type CopyEntryKind = "file" | "directory" | "symlink" | "other";

export type CopyEntryFacts = {
  kind: CopyEntryKind;
  size: number;
  hardLinks: number;
  executable: boolean;
  // An opaque equality token over device, inode and modification time. Two
  // reads that agree saw the same unchanged entry; never parsed.
  identity: string;
};

export interface CopyTreeFsPort {
  // Never follows a trailing symlink. Null when the path is gone.
  describe(path: string): Promise<CopyEntryFacts | null>;

  // Sorted, so one tree is walked the same way twice. Null when the directory
  // cannot be read.
  listNames(path: string): Promise<string[] | null>;

  // Null when the path dangles or loops — the caller never learns which.
  realpath(path: string): Promise<string | null>;

  // A private empty directory inside `parent`, so the closing move is a rename
  // within one filesystem rather than a second copy.
  createStagingDir(parent: string): Promise<string>;

  makeDir(path: string): Promise<void>;

  // Contents and the executable bit; every other permission bit, timestamp and
  // ownership fact of the source is discarded.
  copyFile(from: string, to: string, executable: boolean): Promise<void>;

  movePath(from: string, to: string): Promise<void>;

  // Recursive, and a missing path is not an error.
  removePath(path: string): Promise<void>;
}

const STAGING_PREFIX = ".maestro-copy-";

export class NodeCopyTreeFs implements CopyTreeFsPort {
  async describe(path: string): Promise<CopyEntryFacts | null> {
    try {
      // bigint stats for mtimeNs: a whole-millisecond mtime cannot separate two
      // writes inside one tick, which is exactly the window this guards.
      const stats = await lstat(path, { bigint: true });
      return {
        kind: stats.isFile()
          ? "file"
          : stats.isDirectory()
            ? "directory"
            : stats.isSymbolicLink()
              ? "symlink"
              : "other",
        size: Number(stats.size),
        hardLinks: Number(stats.nlink),
        executable: (stats.mode & 0o111n) !== 0n,
        identity: `${stats.dev}:${stats.ino}:${stats.mtimeNs}`,
      };
    } catch {
      return null;
    }
  }

  async listNames(path: string): Promise<string[] | null> {
    try {
      return (await readdir(path)).sort();
    } catch {
      return null;
    }
  }

  async realpath(path: string): Promise<string | null> {
    try {
      return await realpath(path);
    } catch {
      return null;
    }
  }

  async createStagingDir(parent: string): Promise<string> {
    return mkdtemp(join(parent, STAGING_PREFIX));
  }

  async makeDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  async copyFile(from: string, to: string, executable: boolean): Promise<void> {
    await copyFile(from, to);
    // copyFile carries the source mode over; the destination gets exactly one
    // bit of it back and nothing else.
    await chmod(to, executable ? 0o755 : 0o644);
  }

  async movePath(from: string, to: string): Promise<void> {
    await rename(from, to);
  }

  async removePath(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
  }
}
