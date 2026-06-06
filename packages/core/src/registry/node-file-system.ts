// The real-disk FileSystemPort adapter. The single place in the registry domain
// that touches node:fs. Writes atomically (temp file + rename) so a crash mid-
// write never leaves a half-written config behind.
import {
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import type { FileSystemPort } from "./file-system";

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

  async writeFile(path: string, contents: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}`;
    await writeFile(tmp, contents, "utf8");
    await rename(tmp, path);
  }
}
