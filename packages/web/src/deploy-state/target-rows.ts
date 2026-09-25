import type { DriftViewModel } from "../drift/drift-view-model";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { targetLabel } from "../shell/target-label";
import type { StatusReading } from "../ui/status-reading";
import {
  GLOBAL,
  localEditsLine,
  otherOriginLine,
  REPO_NOT_READ,
  REPOSITORIES,
} from "./deploy-state-copy";
import {
  globalToolView,
  toDeployedView,
  withOtherOrigins,
} from "./deployed-view";
import {
  comparedLine,
  LATEST_RELEASE_UNKNOWN,
  ON_LATEST_RELEASE,
  pinnedTagsLine,
  RELEASE_NOT_ADOPTED,
  releaseSentence,
  unfinishedOperationNotice,
  updateNextStep,
} from "./release-head-copy";
import type { RemoveDialogTarget } from "./remove-ledger-rows";
import { skippedEntryText, skippedNeedsAttention } from "./skipped-entry-text";
import { targetStatus } from "./target-status";
import { toolNameList } from "./tool-labels";
import { toolPresentation } from "./tool-presentation";
import type {
  DeployedPrimitive,
  GitHubPage,
  PendingOperation,
  PinnedPerSkill,
  ReleaseHead,
  SkippedEntry,
} from "./use-deploy-state";
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

const editedSkills = (primitives: readonly DeployedPrimitive[]) =>
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

export function statusSummary(row: TargetRow, now: Date): string[] {
  if (row.readFailed && row.group === REPOSITORIES) {
    return [REPO_NOT_READ.label];
  }
  const lines: string[] = [];
  // An unfinished operation's notice stays the card's heading.
  if (row.pending) {
    const notice = unfinishedOperationNotice(row.pending, row.primitives);
    lines.push(notice.label, notice.message);
  }
  const edited = editedSkills(row.primitives);
  if (edited.length > 0) lines.push(localEditsLine(edited));
  if (row.pinned) {
    lines.push(pinnedTagsLine(row.pinned), RELEASE_NOT_ADOPTED);
  }
  if (row.primitives.length === 0 && row.otherOrigins.length > 0) {
    lines.push(otherOriginLine(row.otherOrigins));
  }
  for (const entry of row.skipped.filter(skippedNeedsAttention)) {
    lines.push(skippedEntryText(entry));
  }
  if (row.head) {
    const { latestRelease } = row.head;
    const sentence = releaseSentence(row.head);
    // Claimed only from this row's own settled read (#1125).
    if (!row.pending && !row.readFailed && !row.behind && !row.pinned) {
      if (latestRelease === null) lines.push(LATEST_RELEASE_UNKNOWN);
      else if (!sentence) lines.push(ON_LATEST_RELEASE);
    }
    if (sentence) lines.push(sentence);
    if (row.behind && latestRelease !== null) {
      lines.push(updateNextStep(latestRelease));
    }
    lines.push(comparedLine(row.head, now));
  }
  return lines;
}
