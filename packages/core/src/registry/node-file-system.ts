// The real-disk FileSystemPort adapter. The single place in the registry domain
// that touches node:fs. Writes atomically (temp file + rename) so a crash mid-
// write never leaves a half-written config behind.
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
import type { FileSystemPort } from "./file-system";

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

  // lstat, not stat: a caller asking "is there an entry here" must not follow
  // a symlink to find out — that would resolve (and so disclose whether it
  // exists) a target the caller never validated against any root ceiling
  // (e.g. the browse facts probe, ADR-0009). The entry itself existing is
  // reported regardless of where it points.
  async exists(path: string): Promise<boolean> {
    try {
      await lstat(path);
      return true;
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

  async listDirectoryNames(path: string): Promise<string[]> {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
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
