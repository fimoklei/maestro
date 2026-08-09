// What is already sitting where a clone would land. Maestro never renames,
// suffixes or deletes to make room — it reuses, refuses, or reports (#555).
import { join } from "node:path";
import { parseGitOrigin } from "../deploy/git-origin";
import type { FileSystemPort } from "../registry/file-system";

export type CloneDestinationState =
  | "free"
  | "same-origin"
  | "partial-clone"
  | "occupied";

export const classifyCloneDestination = async (
  destination: string,
  ownerRepo: string,
  deps: {
    fs: FileSystemPort;
    originUrl: (path: string) => Promise<string | null>;
    headCommit: (path: string) => Promise<string | null>;
  },
): Promise<CloneDestinationState> => {
  const { fs } = deps;
  if (!(await fs.exists(destination))) {
    return "free";
  }
  // Entry, not target: a symlink wearing the destination's name is someone
  // else's arrangement, and cloning through it would write outside the parent.
  if (!(await fs.isDirectoryEntry(destination))) {
    return "occupied";
  }

  if (!(await fs.exists(join(destination, ".git")))) {
    // git itself clones into an existing empty directory; anything else in
    // there is data that is not ours to move.
    return (await fs.listRawEntries(destination)).length === 0
      ? "free"
      : "occupied";
  }

  // No commit at HEAD is what an interrupted clone leaves: git writes the
  // remote before it fetches, so the origin says nothing here.
  if ((await deps.headCommit(destination)) === null) {
    return "partial-clone";
  }

  const origin = await deps.originUrl(destination);
  const parsed = origin === null ? null : parseGitOrigin(origin);
  return parsed?.ownerRepo.toLowerCase() === ownerRepo.toLowerCase()
    ? "same-origin"
    : "occupied";
};
