import { stat } from "node:fs/promises";

// A missing path is false, not an error; a directory there is not a file.
export async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
