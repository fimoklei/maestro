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

type CopyEntryKind = "file" | "directory" | "symlink" | "other";

export type CopyEntryFacts = {
  kind: CopyEntryKind;
  size: number;
  hardLinks: number;
  executable: boolean;
  identity: string;
};

export interface OpenFile {
  facts(): Promise<CopyEntryFacts | null>;
  read(): Promise<Buffer>;
  close(): Promise<void>;
}

export interface CopyTreeFsPort {
  describe(path: string): Promise<CopyEntryFacts | null>;

  listNames(path: string): Promise<string[] | null>;

  realpath(path: string): Promise<string | null>;

  createStagingDir(parent: string): Promise<string>;

  makeDir(path: string): Promise<void>;

  openFile(path: string): Promise<OpenFile | null>;

  openFollowingLinks(path: string): Promise<OpenFile | "missing" | null>;

  writeFile(to: string, bytes: Buffer, executable: boolean): Promise<void>;

  movePath(from: string, to: string): Promise<void>;

  removePath(path: string): Promise<void>;
}

const STAGING_PREFIX = ".maestro-copy-";

export class NodeCopyTreeFs implements CopyTreeFsPort {
  async describe(path: string): Promise<CopyEntryFacts | null> {
    try {
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

  async openFile(path: string): Promise<OpenFile | null> {
    try {
      return openFileOf(
        await open(path, constants.O_RDONLY | constants.O_NOFOLLOW),
      );
    } catch {
      return null;
    }
  }

  async openFollowingLinks(path: string): Promise<OpenFile | "missing" | null> {
    try {
      return openFileOf(await open(path, constants.O_RDONLY));
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "missing"
        : null;
    }
  }

  async writeFile(
    to: string,
    bytes: Buffer,
    executable: boolean,
  ): Promise<void> {
    await writeFile(to, bytes, { mode: executable ? 0o755 : 0o644 });
    await chmod(to, executable ? 0o755 : 0o644);
  }

  async movePath(from: string, to: string): Promise<void> {
    await rename(from, to);
  }

  async removePath(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
  }
}

function openFileOf(handle: FileHandle): OpenFile {
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
