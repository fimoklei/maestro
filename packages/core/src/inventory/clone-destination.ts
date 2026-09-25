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
  // Entry, not target: cloning through a symlink would write outside the parent.
  if (!(await fs.isDirectoryEntry(destination))) {
    return "occupied";
  }

  if (!(await fs.exists(join(destination, ".git")))) {
    // Only a knowably empty directory is free.
    const entries = await fs.listRawEntries(destination).catch(() => null);
    return entries?.length === 0 ? "free" : "occupied";
  }

  // Only partial-clone recovers by deleting the folder, so unknown is occupied.
  const head = await deps.probeHead(destination);
  if (head === "unknown") {
    return "occupied";
  }

  // A commitless repository with another origin is not this clone's leftover.
  const origin = await deps.originUrl(destination);
  const parsed = origin === null ? null : parseGitOrigin(origin);
  if (parsed?.ownerRepo.toLowerCase() !== ownerRepo.toLowerCase()) {
    return "occupied";
  }
  return head === "commit" ? "same-origin" : "partial-clone";
};
