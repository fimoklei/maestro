import type {
  DeployedPrimitive,
  GitHubPage,
  PendingOperation,
  PinnedPerSkill,
  ReleaseHead,
  SkippedEntry,
} from "@maestro/core";
import type { DriftViewModel } from "../drift/drift-view-model";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { targetLabel } from "../shell/target-label";
import type { Copy } from "../ui/phrase";
import type { StatusReading } from "../ui/status-reading";
import {
  GLOBAL,
  localEditsReason,
  NO_REPOSITORIES,
  NO_TOOL_DETECTED,
  otherOriginLine,
  REPO_NOT_READ,
  REPOSITORIES,
  UNREACHED_HINT,
} from "./deploy-state-copy";
import {
  globalToolView,
  toDeployedView,
  withOtherOrigins,
} from "./deployed-view";
import {
  behindReason,
  comparedFact,
  LATEST_RELEASE_UNKNOWN,
  ON_LATEST_RELEASE,
  pinnedTagsLine,
  UNFINISHED_REASONS,
} from "./release-head-copy";
import type { RemoveDialogTarget } from "./remove-ledger-rows";
import {
  skippedEntryReason,
  skippedEntryText,
  skippedNeedsAttention,
} from "./skipped-entry-text";
import { targetStatus } from "./target-status";
import { toolNameList, toolPresentation } from "./tool-presentation";
import type { GlobalDeployStateView } from "./use-global-deploy-state";

// One Deploy-state row per target: a detected tool or a registered repository.
export type TargetRow = {
  id: string;
  group: typeof GLOBAL | typeof REPOSITORIES;
  name: string;
  path: string;
  /** The whole path where `name` shortens it (#211). */
  title?: string;
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
};

// A row's id, which another screen names to open that row's pane.
export const globalRowId = (tool: string) => `global:${tool}`;
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

export const editedSkills = (primitives: readonly DeployedPrimitive[]) =>
  primitives
    .filter((primitive) => primitive.copy === "local-edits")
    .map((primitive) => primitive.name);

// One lockfile and one release for every detected tool, so any tool reading
// behind puts every tool row behind (#951).
export const isGlobalBehind = (
  tools: readonly { releaseHead?: ReleaseHead }[],
  pending?: PendingOperation,
) => tools.some((tool) => isBehind(tool.releaseHead, pending));

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
  const pending = data.pendingOperation;
  const tools = data.tools.map((group) => group.tool);
  const behind = isGlobalBehind(data.tools, pending);
  return data.tools.map((group) => {
    const { label, destination } = toolPresentation(group.tool);
    const names = group.primitives.map((primitive) => primitive.name);
    // Narrowed to this tool's skills, so one tool's drift never leaks in.
    const toolDrift = drift.forTool(names);
    const indicator = readFailed
      ? "unknown"
      : withOtherOrigins(
          toolDrift.targetIndicator(globalToolView(names, data.skipped)),
          data.otherOrigins,
        );
    return {
      id: globalRowId(group.tool),
      group: GLOBAL,
      name: label,
      path: destination,
      target: { kind: "global", tools },
      wire: { kind: "global" },
      updateName: toolNameList(tools),
      release: releaseOf(group.releaseHead, group.pinnedPerSkill),
      status: targetStatus({
        indicator,
        pinnedPerSkill: group.pinnedPerSkill !== undefined,
        behind,
        mixedReleases: pending?.kind === "update",
        localEdits: !readFailed && editedSkills(group.primitives).length > 0,
      }),
      skills: group.primitives.length,
      ...(group.releaseHead ? { head: group.releaseHead } : {}),
      ...(group.releaseGitHub ? { releaseGitHub: group.releaseGitHub } : {}),
      ...(group.pinnedPerSkill ? { pinned: group.pinnedPerSkill } : {}),
      ...(pending ? { pending } : {}),
      primitives: group.primitives,
      drift: toolDrift,
      // A skipped entry or a foreign origin names no tool, so every tool carries them.
      skipped: data.skipped,
      otherOrigins: data.otherOrigins,
      ...(group.extraFiles === undefined
        ? {}
        : { extraFiles: group.extraFiles }),
      readFailed,
      behind,
    };
  });
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
  const label = targetLabel(repoPath, siblings);
  return {
    id: repoRowId(repoPath),
    group: REPOSITORIES,
    name: label,
    path: repoPath,
    title: repoPath,
    target: { kind: "repo", repoPath },
    wire: { kind: "repo", repoPath },
    updateName: label,
    release: releaseOf(head, pinned),
    status: targetStatus({
      indicator: drift.targetIndicator(toDeployedView(read)),
      pinnedPerSkill: pinned !== undefined,
      behind,
      mixedReleases: pending?.kind === "update",
      localEdits:
        !read.isError && editedSkills(data?.primitives ?? []).length > 0,
    }),
    skills: data === undefined ? null : data.primitives.length,
    ...(head ? { head } : {}),
    ...(pinned ? { pinned } : {}),
    ...(pending ? { pending } : {}),
    primitives: data?.primitives ?? [],
    drift,
    skipped: data?.skipped ?? [],
    otherOrigins: [],
    ...(data?.extraFiles === undefined ? {} : { extraFiles: data.extraFiles }),
    readFailed: read.isError,
    behind,
    ...(data?.github ? { github: data.github } : {}),
    ...(data?.releaseGitHub ? { releaseGitHub: data.releaseGitHub } : {}),
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
  const edited = editedSkills(row.primitives);
  if (!row.readFailed && edited.length > 0) return localEditsReason(edited);
  if (row.pinned) return pinnedTagsLine(row.pinned);
  if (row.readFailed) return REPO_NOT_READ.label;
  if (row.primitives.length === 0 && row.otherOrigins.length > 0) {
    return otherOriginLine(row.otherOrigins);
  }
  const skipped = row.skipped.find(skippedNeedsAttention);
  if (skipped) return skippedEntryReason(skipped);
  if (row.status?.family === "unknown") return UNREACHED_HINT;
  if (!row.head) return null;
  if (row.head.latestRelease === null) return LATEST_RELEASE_UNKNOWN;
  return row.behind ? behindReason(row.head) : ON_LATEST_RELEASE;
}

export function statusCard(row: TargetRow, now: Date): StatusCard {
  if (row.readFailed && row.group === REPOSITORIES) {
    return { reason: REPO_NOT_READ.label, readAge: null };
  }
  return {
    reason: statusReason(row),
    readAge: row.head ? comparedFact(row.head, now) : null,
  };
}
