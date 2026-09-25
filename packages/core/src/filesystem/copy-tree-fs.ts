import type { BigIntStats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import {
  chmod,
  constants,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

export type CopyEntryKind = "file" | "directory" | "symlink" | "other";

export type CopyEntryFacts = {
  kind: CopyEntryKind;
  size: number;
  hardLinks: number;
  executable: boolean;
  // Opaque token over device, inode and mtime; compare only, never parse.
  identity: string;
};

// Closing is the reader's job.
export interface OpenFile {
  facts(): Promise<CopyEntryFacts | null>;
  read(): Promise<Buffer>;
  close(): Promise<void>;
}

export interface CopyTreeFsPort {
  // Never follows a trailing symlink. Null when the path is gone.
  describe(path: string): Promise<CopyEntryFacts | null>;

  // Sorted. Null when the directory cannot be read.
  listNames(path: string): Promise<string[] | null>;

  // Null when the path dangles or loops; the caller never learns which.
  realpath(path: string): Promise<string | null>;

  // Inside `parent`, so the closing move is a rename within one filesystem.
  createStagingDir(parent: string): Promise<string>;

  makeDir(path: string): Promise<void>;

  // Never follows a symlink in the final component.
  openFile(path: string): Promise<OpenFile | null>;

  // Keeps the executable bit and nothing else of the source's mode.
  writeFile(to: string, bytes: Buffer, executable: boolean): Promise<void>;

  movePath(from: string, to: string): Promise<void>;

  // Recursive; a missing path is not an error.
  removePath(path: string): Promise<void>;
}

const STAGING_PREFIX = ".maestro-copy-";

export class NodeCopyTreeFs implements CopyTreeFsPort {
  async describe(path: string): Promise<CopyEntryFacts | null> {
    try {
      // bigint for mtimeNs: a millisecond mtime misses two writes in one tick.
      return factsOf(await lstat(path, { bigint: true }));
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

  // O_NOFOLLOW guards the final component only; Node has no openat.
  // ponytail: per-component openat if Node ever exposes it.
  async openFile(path: string): Promise<OpenFile | null> {
    let handle: FileHandle;
    try {
      handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch {
      return null;
    }
    return {
      facts: async () => {
        try {
          return factsOf(await handle.stat({ bigint: true }));
        } catch {
          return null;
        }
      },
      read: () => handle.readFile(),
      close: async () => {
        await handle.close();
      },
    };
  }

  async writeFile(
    to: string,
    bytes: Buffer,
    executable: boolean,
  ): Promise<void> {
    await writeFile(to, bytes, { mode: executable ? 0o755 : 0o644 });
    // The mode above is subject to umask and applies only on create.
    await chmod(to, executable ? 0o755 : 0o644);
  }

  async movePath(from: string, to: string): Promise<void> {
    await rename(from, to);
  }

  async removePath(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
  }
}

function factsOf(stats: BigIntStats): CopyEntryFacts {
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
}
