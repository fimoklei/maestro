import type {
  DeployedPrimitive,
  GitHubPage,
  GlobalFolderState,
  PendingOperation,
  PinnedPerSkill,
  ReleaseHead,
  SkippedEntry,
} from "@maestro/core";
import type { DriftViewModel } from "../drift/drift-view-model";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { repoTargetName } from "../shell/target-name";
import type { Copy } from "../ui/phrase";
import type { StatusReading } from "../ui/status-reading";
import {
  GLOBAL,
  localEditsLine,
  NO_REPOSITORIES,
  NO_TOOL_DETECTED,
  notUpdatedLine,
  notWrittenNote,
  otherOriginLine,
  REPO_NOT_READ,
  REPOSITORIES,
  readByLine,
  TIMED_OUT_HINT,
  UNREACHED_HINT,
} from "./deploy-state-copy";
import {
  globalToolView,
  toDeployedView,
  withOtherOrigins,
} from "./deployed-view";
import {
  behindLine,
  LATEST_RELEASE_UNKNOWN,
  ON_LATEST_RELEASE,
  pinnedTagsLine,
  screenComparedFact,
  UNFINISHED_REASONS,
} from "./release-head-copy";
import type { RemoveDialogTarget } from "./remove-ledger-rows";
import {
  skippedEntryReason,
  skippedEntryText,
  skippedNeedsAttention,
} from "./skipped-entry-text";
import { NOT_UPDATED, targetStatus, worstFolderReading } from "./target-status";
import { toolDisplayName } from "./tool-presentation";
import { updateLabel } from "./update-target-copy";
import type { GlobalDeployStateView } from "./use-global-deploy-state";

/** A Global folder under the Global row: read-only, with no action of its own. */
export type FolderRow = {
  path: string;
  /** Global writes this folder only while its tool is detected. */
  detected: boolean;
  /** The folder's reading; null where Global does not write it, or not read yet. */
  status: StatusReading | null;
  readBy: string;
  /** Muted beside a folder Global does not write; null on one it writes. */
  note: string | null;
  /** Why the folder reads Not updated; null where it does not. */
  notUpdated: Copy | null;
};

// One Deploy-state row per target: Global or a registered repository.
export type TargetRow = {
  id: string;
  group: typeof GLOBAL | typeof REPOSITORIES;
  name: string;
  path: string;
  target: RemoveDialogTarget;
  /** What an update or retry sends; every tool row names the one global target. */
  wire: DeployTarget;
  updateName: string;
  release: { current: string; latest: string | null } | null;
  status: StatusReading | null;
  /** Null until the target has been read. */
  skills: number | null;
  head?: ReleaseHead;
  pinned?: PinnedPerSkill;
  pending?: PendingOperation;
  primitives: DeployedPrimitive[];
  drift: DriftViewModel;
  skipped: SkippedEntry[];
  otherOrigins: string[];
  extraFiles?: number;
  readFailed: boolean;
  /** A newer release exists and nothing unfinished stands before it. */
  behind: boolean;
  /** A repository's own GitHub page; absent for Global and where none exists. */
  github?: GitHubPage;
  /** The Release fact's page on GitHub; absent where none exists. */
  releaseGitHub?: GitHubPage;
  /** The Latest release fact's page on GitHub; absent where none exists. */
  latestReleaseGitHub?: GitHubPage;
  /** Global's folders, shown as read-only rows under it; absent on a repository. */
  folders?: FolderRow[];
};

// A row's id, which another screen names to open that row's pane.
export const GLOBAL_ROW_ID = "global";
export const repoRowId = (repoPath: string) => `repo:${repoPath}`;

export const isBehind = (
  head: ReleaseHead | undefined,
  pending?: PendingOperation,
) =>
  head !== undefined &&
  head.latestRelease !== null &&
  head.latestRelease !== head.release &&
  pending === undefined;

/** Whether one skill's local edits can be imported from its target. */
export const canImportLocalEdits = (
  pending: PendingOperation | undefined,
  primitive: Pick<DeployedPrimitive, "copy">,
) => pending === undefined && primitive.copy === "local-edits";

/** Each Global folder's Not updated sentence, in folder order. */
export const notUpdatedLines = (row: Pick<TargetRow, "folders">): Copy[] =>
  (row.folders ?? []).flatMap((folder) =>
    folder.notUpdated === null ? [] : [folder.notUpdated],
  );

export const editedSkills = (primitives: readonly DeployedPrimitive[]) =>
  primitives
    .filter((primitive) => primitive.copy === "local-edits")
    .map((primitive) => primitive.name);

const releaseOf = (
  head: ReleaseHead | undefined,
  pinned: PinnedPerSkill | undefined,
): TargetRow["release"] =>
  head
    ? { current: head.release, latest: head.latestRelease }
    : pinned?.[0]
      ? { current: pinned[0].release, latest: null }
      : null;

export function globalRows(
  data: GlobalDeployStateView,
  drift: DriftViewModel,
  readFailed: boolean,
): TargetRow[] {
  const tools = data.detectedTools;
  // No tool, no folder Global writes: the group's own line says so.
  if (tools.length === 0) return [];
  const pending = data.pendingOperation;
  const behind = isBehind(data.releaseHead, pending);
  // Every folder shares Global's release, operation and read; only its own
  // copies differ.
  const readingOf = (folder: GlobalFolderState) => {
    const primitives = folder.primitives;
    const names = primitives.map((primitive) => primitive.name);
    const indicator = readFailed
      ? "unknown"
      : withOtherOrigins(
          drift
            .forTool(names)
            .targetIndicator(
              globalToolView(names, data.skipped, data.releaseHead),
            ),
          data.otherOrigins,
        );
    return targetStatus({
      indicator,
      pinnedPerSkill: data.pinnedPerSkill !== undefined,
      behind,
      // A failed read's stale record never outranks its Unknown.
      pending: readFailed ? undefined : pending?.kind,
      localEdits: !readFailed && editedSkills(primitives).length > 0,
      notUpdated: !readFailed && (folder.notUpdated?.length ?? 0) > 0,
    });
  };
  const release = data.releaseHead?.release;
  const folders: FolderRow[] = data.folders.map((folder) => ({
    path: folder.path,
    detected: folder.detected,
    status: folder.detected ? readingOf(folder) : null,
    readBy: readByLine(folder.readBy),
    note: folder.detected ? null : notWrittenNote(toolDisplayName(folder.tool)),
    notUpdated:
      readFailed || release === undefined || !folder.notUpdated?.length
        ? null
        : notUpdatedLine(folder.path, folder.notUpdated, release),
  }));
  const names = data.primitives.map((primitive) => primitive.name);
  return [
    {
      id: GLOBAL_ROW_ID,
      group: GLOBAL,
      name: GLOBAL,
      path: "",
      target: { kind: "global", tools },
      wire: { kind: "global" },
      updateName: GLOBAL,
      release: releaseOf(data.releaseHead, data.pinnedPerSkill),
      status: worstFolderReading(
        folders.filter((folder) => folder.detected).map((f) => f.status),
      ),
      skills: data.primitives.length,
      ...(data.releaseHead ? { head: data.releaseHead } : {}),
      ...(data.releaseGitHub ? { releaseGitHub: data.releaseGitHub } : {}),
      ...(data.latestReleaseGitHub
        ? { latestReleaseGitHub: data.latestReleaseGitHub }
        : {}),
      ...(data.pinnedPerSkill ? { pinned: data.pinnedPerSkill } : {}),
      // A failed read's stale record offers no retry: Re-read is the way back.
      ...(pending && !readFailed ? { pending } : {}),
      primitives: data.primitives,
      drift: drift.forTool(names),
      skipped: data.skipped,
      otherOrigins: data.otherOrigins,
      ...(data.extraFiles === undefined ? {} : { extraFiles: data.extraFiles }),
      readFailed,
      behind,
      folders,
    },
  ];
}

type RepoRead = {
  data:
    | {
        primitives: DeployedPrimitive[];
        skipped: SkippedEntry[];
        releaseHead?: ReleaseHead;
        pinnedPerSkill?: PinnedPerSkill;
        extraFiles?: number;
        pendingOperation?: PendingOperation;
        github?: GitHubPage;
        releaseGitHub?: GitHubPage;
        latestReleaseGitHub?: GitHubPage;
      }
    | undefined;
  isError: boolean;
};

export function repoRow(
  repoPath: string,
  siblings: readonly string[],
  read: RepoRead,
  drift: DriftViewModel,
): TargetRow {
  const data = read.data;
  const head = data?.releaseHead;
  const pinned = data?.pinnedPerSkill;
  const pending = data?.pendingOperation;
  const behind = isBehind(head, pending);
  const label = repoTargetName(repoPath, siblings);
  return {
    id: repoRowId(repoPath),
    group: REPOSITORIES,
    name: label,
    path: repoPath,
    target: { kind: "repo", repoPath, name: label },
    wire: { kind: "repo", repoPath },
    updateName: label,
    release: releaseOf(head, pinned),
    status: targetStatus({
      indicator: drift.targetIndicator(toDeployedView(read)),
      pinnedPerSkill: pinned !== undefined,
      behind,
      pending: read.isError ? undefined : pending?.kind,
      localEdits:
        !read.isError && editedSkills(data?.primitives ?? []).length > 0,
    }),
    skills: data === undefined ? null : data.primitives.length,
    ...(head ? { head } : {}),
    ...(pinned ? { pinned } : {}),
    ...(pending && !read.isError ? { pending } : {}),
    primitives: data?.primitives ?? [],
    drift,
    skipped: data?.skipped ?? [],
    otherOrigins: [],
    ...(data?.extraFiles === undefined ? {} : { extraFiles: data.extraFiles }),
    readFailed: read.isError,
    behind,
    ...(data?.github ? { github: data.github } : {}),
    ...(data?.releaseGitHub ? { releaseGitHub: data.releaseGitHub } : {}),
    ...(data?.latestReleaseGitHub
      ? { latestReleaseGitHub: data.latestReleaseGitHub }
      : {}),
  };
}

/**
 * The lines an empty group shows; null leaves it to the screen. A null read is
 * the failed-read notice's, and a filtered-out group is No filter match's.
 */
export function emptyGroupLines(
  group: string,
  facts: {
    filtered: boolean;
    global: { tools: number; skipped: readonly SkippedEntry[] } | null;
    repositories: number | null;
  },
): Copy[] | null {
  if (facts.filtered) return null;
  if (group === GLOBAL) {
    // With no tool row to open, the line also names each skipped entry.
    return facts.global?.tools === 0
      ? [NO_TOOL_DETECTED, ...facts.global.skipped.map(skippedEntryText)]
      : null;
  }
  return facts.repositories === 0 ? [NO_REPOSITORIES] : null;
}

/** The Status hover card: one reason sentence, then the read age; the pane holds the rest. */
export type StatusCard = { reason: Copy | null; readAge: string | null };

function statusReason(row: TargetRow): Copy | null {
  if (row.pending) return UNFINISHED_REASONS[row.pending.kind];
  const [notUpdated] = notUpdatedLines(row);
  if (notUpdated !== undefined && row.status?.word === NOT_UPDATED.word) {
    return notUpdated;
  }
  const edited = editedSkills(row.primitives);
  if (!row.readFailed && edited.length > 0)
    return localEditsLine(edited, row.behind);
  if (row.pinned) return pinnedTagsLine(row.pinned);
  if (row.readFailed) return REPO_NOT_READ;
  if (row.primitives.length === 0 && row.otherOrigins.length > 0) {
    return otherOriginLine(row.otherOrigins);
  }
  const skipped = row.skipped.find(skippedNeedsAttention);
  if (skipped) return skippedEntryReason(skipped);
  if (row.status?.family === "unknown") {
    return row.drift.timedOut ? TIMED_OUT_HINT : UNREACHED_HINT;
  }
  if (!row.head) return null;
  if (row.head.latestRelease === null) return LATEST_RELEASE_UNKNOWN;
  return row.behind
    ? behindLine(row.head, updateLabel(row))
    : ON_LATEST_RELEASE;
}

/** `compared` is band 2's line, the screen's oldest reading. */
export function statusCard(
  row: TargetRow,
  compared: string | null,
): StatusCard {
  if (row.readFailed && row.group === REPOSITORIES) {
    return { reason: REPO_NOT_READ, readAge: null };
  }
  return {
    reason: statusReason(row),
    readAge: row.head ? screenComparedFact(row.head, compared) : null,
  };
}
