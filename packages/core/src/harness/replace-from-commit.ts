import { join } from "node:path";
import type { CopyTreeFsPort } from "../filesystem/copy-tree-fs";
import { type PrimitiveRef, primitiveEntry } from "./harness-primitive";
import type { PrimitiveEntry } from "./harness-primitive-dir";
import type { HarnessGitPort } from "./read-harness-state";

export type ReplaceDeps = {
  copyFs: Pick<CopyTreeFsPort, "createStagingDir" | "movePath" | "removePath">;
  git: Pick<HarnessGitPort, "writePrimitiveInto">;
};

/**
 * Makes the primitive on disk equal to its copy at `commit`: written where
 * absent, swapped where both hold it, set aside where the commit lacks it.
 */
export async function replaceFromCommit(
  deps: ReplaceDeps,
  {
    root,
    ref,
    commit,
    entry,
    held,
  }: {
    root: string;
    ref: PrimitiveRef;
    commit: string;
    entry: Extract<PrimitiveEntry, { kind: "plain" | "absent" }>;
    // Whether `commit` holds the primitive.
    held: boolean;
  },
): Promise<boolean> {
  if (!held && entry.kind === "absent") {
    return true;
  }
  let staging: string;
  try {
    staging = await deps.copyFs.createStagingDir(entry.dir);
  } catch {
    return false;
  }
  // Both moves are renames within the type's folder, so the primitive is never
  // half-written, and a failed second move puts the first one back.
  const setAside = join(staging, "discarded");
  try {
    if (held) {
      const written = await deps.git.writePrimitiveInto(
        root,
        ref,
        commit,
        staging,
      );
      if (written !== "written") {
        return false;
      }
    }
    if (entry.kind === "plain") {
      await deps.copyFs.movePath(entry.path, setAside);
    }
    if (held) {
      try {
        await deps.copyFs.movePath(
          join(staging, primitiveEntry(ref)),
          entry.path,
        );
      } catch {
        if (entry.kind === "plain") {
          await deps.copyFs.movePath(setAside, entry.path);
        }
        return false;
      }
    }
    return true;
  } catch {
    return false;
  } finally {
    await deps.copyFs.removePath(staging).catch(() => {});
  }
}
