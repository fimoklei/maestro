import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A temp folder the registry accepts: registration takes a Git repository only. */
export async function makeRepoDir(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(path, ".git"));
  return path;
}
