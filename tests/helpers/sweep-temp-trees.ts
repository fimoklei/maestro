// Vitest `globalSetup`: drops the temp trees earlier runs left behind. Every
// suite names its tree `maestro-…`, so the prefix is what marks one as ours.
import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PREFIX = "maestro-";

// Older than any live tree: a suite's tree lives seconds, and sibling worktrees
// run their suites concurrently against this same directory.
const STALE_MS = 6 * 60 * 60 * 1000;

export async function sweepStaleTempTrees(
  root: string,
  staleMs: number,
): Promise<void> {
  const cutoff = Date.now() - staleMs;
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.startsWith(PREFIX)) {
      continue;
    }
    const path = join(root, entry);
    try {
      if ((await stat(path)).mtimeMs > cutoff) {
        continue;
      }
      // `maxRetries` for the same push/`objects/` race `removeGitTempTree` hits.
      await rm(path, { recursive: true, force: true, maxRetries: 5 });
    } catch {
      // A tree another process holds, or one this user cannot remove. Leaving
      // it costs a directory; failing the run costs the whole suite.
    }
  }
}

export const setup = (): Promise<void> =>
  sweepStaleTempTrees(tmpdir(), STALE_MS);
