// What is already sitting where a clone would land. Maestro never renames,
// suffixes or deletes to make room — it reuses, refuses, or reports (#555).
import { join } from "node:path";
import { parseGitOrigin } from "../deploy/git-origin";
import type { FileSystemPort } from "../registry/file-system";
import type { HeadProbe } from "./head-commit";

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
    probeHead: (path: string) => Promise<HeadProbe>;
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
    // there is data that is not ours to move. A directory that will not open
    // is not knowably empty, so it counts as holding something.
    const entries = await fs.listRawEntries(destination).catch(() => null);
    return entries?.length === 0 ? "free" : "occupied";
  }

  // Git failing to look is not git reporting an empty repository, and only
  // partial-clone carries "delete this folder" as its recovery.
  const head = await deps.probeHead(destination);
  if (head === "unknown") {
    return "occupied";
  }

  // Read before the missing commit is interpreted: an interrupted clone
  // already carries the remote it was cloning, so a repository with no commit
  // and another origin is someone else's, not this clone's leftover.
  const origin = await deps.originUrl(destination);
  const parsed = origin === null ? null : parseGitOrigin(origin);
  if (parsed?.ownerRepo.toLowerCase() !== ownerRepo.toLowerCase()) {
    return "occupied";
  }
  return head === "commit" ? "same-origin" : "partial-clone";
};
