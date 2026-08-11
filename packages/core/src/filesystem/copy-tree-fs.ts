// The filesystem boundary for the bounded skill-folder copy — link counts, file
// kinds and a staging directory, which FileSystemPort has no other caller for.

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
  // An opaque equality token over device, inode and modification time. Two
  // reads that agree saw the same unchanged entry; never parsed.
  identity: string;
};

// One open regular file: its facts as the kernel sees it through this
// descriptor, and its bytes. Closing is the reader's job.
export interface OpenFile {
  facts(): Promise<CopyEntryFacts | null>;
  read(): Promise<Buffer>;
  close(): Promise<void>;
}

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

  // Opens a regular file without following a symbolic link in its final
  // component, so the bytes read are the ones the plan judged rather than
  // whatever the name points at now. Null when it cannot be opened that way.
  openFile(path: string): Promise<OpenFile | null>;

  // Writes bytes already read through an open descriptor, with the executable
  // bit and nothing else of the source's mode.
  writeFile(to: string, bytes: Buffer, executable: boolean): Promise<void>;

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

  // O_NOFOLLOW guards the final component only — Node has no openat, so an
  // ancestor directory swapped mid-copy is out of reach here. The identity
  // re-check on the descriptor is what catches the file itself changing.
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
    // The mode above only applies to a file this call creates; chmod makes it
    // the file's mode whatever the umask did to it.
    await chmod(to, executable ? 0o755 : 0o644);
  }

  async movePath(from: string, to: string): Promise<void> {
    await rename(from, to);
  }

  async removePath(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
  }
}

// One shape for both readers, so a descriptor's facts and a path's facts are
// comparable field by field.
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
