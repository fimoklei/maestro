// The real-disk FileSystemPort adapter — the one place in the registry domain
// that touches node:fs.
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import type { FileSystemPort, RawDirEntry } from "./file-system";

// Monotonic suffix so two writes in one process never share a temp filename,
// independent of any caller-side serialization.
let writeCounter = 0;

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "ENOENT"
  );
}

// A missing directory reads as empty: a missing .apm/skills/ is "no skills",
// not a failure to browse it.
async function readdirOrEmpty<T>(op: () => Promise<T[]>): Promise<T[]> {
  try {
    return await op();
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    throw error;
  }
}

export class NodeFileSystem implements FileSystemPort {
  async realpath(path: string): Promise<string> {
    return realpath(path);
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      return (await stat(path)).isDirectory();
    } catch {
      return false;
    }
  }

  async isDirectoryEntry(path: string): Promise<boolean> {
    try {
      return (await lstat(path)).isDirectory();
    } catch {
      return false;
    }
  }

  // lstat, not stat: following the symlink would disclose whether a target the
  // caller never ceiling-checked exists (ADR-0009).
  async exists(path: string): Promise<boolean> {
    try {
      await lstat(path);
      return true;
    } catch {
      return false;
    }
  }

  async isFileEntry(path: string): Promise<boolean> {
    try {
      return (await lstat(path)).isFile();
    } catch {
      return false;
    }
  }

  async readFile(path: string): Promise<string | null> {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async listRawEntries(path: string): Promise<RawDirEntry[]> {
    const entries = await readdirOrEmpty(() =>
      readdir(path, { withFileTypes: true }),
    );
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isSymlink: e.isSymbolicLink(),
    }));
  }

  async writeFile(path: string, contents: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}-${writeCounter++}`;
    await writeFile(tmp, contents, "utf8");
    await rename(tmp, path);
  }

  async ensureDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }
}
