import type {
  PendingOperation,
  RegistryEntry,
  ReleaseHead,
} from "@maestro/core";
import { repoTargetName } from "../shell/target-name";
import { GLOBAL } from "./deploy-state-copy";

export type TargetReading = {
  id: string;
  name: string;
  state: "loading" | "read" | "read-failed" | "folder-missing";
  behind: boolean;
};

export type Read<T> = { data: T | undefined; isError: boolean };

type RepoHead = {
  releaseHead?: ReleaseHead;
  pendingOperation?: PendingOperation;
};

export const GLOBAL_ROW_ID = "global";
export const repoRowId = (repoPath: string) => `repo:${repoPath}`;

const isBehind = (
  head: ReleaseHead | undefined,
  pending: PendingOperation | undefined,
) =>
  head !== undefined &&
  head.latestRelease !== null &&
  head.latestRelease !== head.release &&
  pending === undefined;

const stateOf = (read: Read<unknown>): TargetReading["state"] =>
  read.isError ? "read-failed" : read.data === undefined ? "loading" : "read";

export function repoReading(
  entry: RegistryEntry,
  siblings: readonly string[],
  read: Read<RepoHead>,
): TargetReading {
  const target = {
    id: repoRowId(entry.path),
    name: repoTargetName(entry.path, siblings),
  };
  if (entry.status === "folder-missing") {
    return { ...target, state: "folder-missing", behind: false };
  }
  return {
    ...target,
    state: stateOf(read),
    behind: isBehind(read.data?.releaseHead, read.data?.pendingOperation),
  };
}

export function repoReadings(
  entries: readonly RegistryEntry[],
  reads: readonly Read<RepoHead>[],
): TargetReading[] {
  const paths = entries.map((entry) => entry.path);
  return entries.map((entry, index) =>
    repoReading(
      entry,
      paths,
      reads[index] ?? { data: undefined, isError: false },
    ),
  );
}

export function globalReading(
  read: Read<RepoHead & { detectedTools: readonly unknown[] }>,
): TargetReading {
  const data = read.data;
  return {
    id: GLOBAL_ROW_ID,
    name: GLOBAL,
    state: stateOf(read),
    behind:
      data !== undefined &&
      data.detectedTools.length > 0 &&
      isBehind(data.releaseHead, data.pendingOperation),
  };
}
