// What an Update did, as a Report. A repository states its failures per skill,
// per tool only where the tools disagree; Global states one fact per Global
// folder.
import type {
  FolderOutcomes,
  GlobalFolderState,
  UpdateOutcomeRow,
  UpdateSkillState,
} from "@maestro/core";
import { HttpError } from "../api/http";
import type { FoldLine } from "../ui/fold-list";
import type { ReportGroup } from "../ui/report";
import { notWrittenNote } from "./deploy-state-copy";
import { toolDisplayName } from "./tool-presentation";
import {
  consentRowName,
  outcomeDetail,
  outcomeHeading,
  type UnlandedState,
  UPDATE_INCOMPLETE,
} from "./update-target-copy";
import { NOT_CONFIRMED, updatedToLine } from "./written-to-copy";

/** What the dialog shows once an update ran. */
export type UpdateRunView =
  | { kind: "skills"; rows: readonly UpdateOutcomeRow[] }
  | { kind: "folders"; folders: FolderOutcomes }
  // Global, where nothing read the folders back.
  | { kind: "unknown" };

const STATES = new Set([
  "updated",
  "removed",
  "not-updated",
  "missing",
  "not-removed",
  "unknown",
]);

const SKILL_OUTCOMES = new Set([
  "written",
  "missing",
  "not-updated",
  "not-confirmed",
]);

const bodyOf = (error: unknown): Record<string, unknown> | null =>
  error instanceof HttpError && typeof error.body === "object"
    ? ((error.body as Record<string, unknown> | null) ?? null)
    : null;

// A report this build cannot read is dropped whole: a row built on a guess
// states an outcome the server never proved.
export function updateOutcomeRows(error: unknown): UpdateOutcomeRow[] | null {
  const outcome = bodyOf(error)?.outcome;
  if (!Array.isArray(outcome)) {
    return null;
  }
  const rows: UpdateOutcomeRow[] = [];
  for (const entry of outcome as UpdateOutcomeRow[]) {
    if (
      typeof entry?.name !== "string" ||
      !(entry.tool === null || typeof entry.tool === "string") ||
      !STATES.has(entry.state)
    ) {
      return null;
    }
    rows.push({ name: entry.name, tool: entry.tool, state: entry.state });
  }
  return rows;
}

/** A failed Global update's folders, read back where apm ran; null otherwise. */
export function updateFolders(error: unknown): FolderOutcomes | null {
  const folders = bodyOf(error)?.folders as FolderOutcomes | undefined;
  const readable =
    typeof folders?.release === "string" &&
    Array.isArray(folders.folders) &&
    folders.folders.every(
      (folder) =>
        typeof folder?.path === "string" &&
        typeof folder.written === "boolean" &&
        Array.isArray(folder.skills) &&
        folder.skills.every(
          (skill) =>
            typeof skill?.name === "string" &&
            SKILL_OUTCOMES.has(skill.outcome),
        ),
    );
  return readable && folders !== undefined ? folders : null;
}

export function updateOutcomeReport(input: {
  rows: readonly UpdateOutcomeRow[];
  releases: { from: string; to: string };
  /** Retry update is on screen, so a failure names it as the next step. */
  retry: boolean;
}): { heading: string; groups: ReportGroup[] } {
  const { releases, retry } = input;
  const rows = foldAgreeingTools(input.rows);
  const inState = <S extends UpdateSkillState>(...states: S[]) =>
    rows.filter((row): row is UpdateOutcomeRow & { state: S } =>
      (states as UpdateSkillState[]).includes(row.state),
    );
  const detailed = (row: UpdateOutcomeRow & { state: UnlandedState }) => ({
    name: consentRowName(row),
    detail: outcomeDetail(row.state, releases, retry),
  });

  const failed = inState("not-updated", "missing", "not-removed").map(detailed);
  const unknown = inState("unknown").map(detailed);
  return {
    heading: outcomeHeading(
      releases.to,
      failed.length > 0
        ? "failed"
        : unknown.length > 0
          ? "unconfirmed"
          : "landed",
    ),
    groups: [
      { tone: "failed", label: "Failed", rows: failed },
      { tone: "attention", label: "Attention", rows: unknown },
    ],
  };
}

/** Global's Report frame: one `Written to` line per Global folder. */
export function updateFoldersReport(input: {
  folders: FolderOutcomes;
  /** The update did not finish: Retry update is in the footer, and a deviating folder names it. */
  retry: boolean;
}): { heading: string; lines: FoldLine[] } {
  const { folders, retry } = input;
  const outcomes = folders.folders.flatMap((folder) =>
    folder.skills.map((skill) => skill.outcome),
  );
  const verdict = outcomes.some(
    (outcome) => outcome === "missing" || outcome === "not-updated",
  )
    ? "failed"
    : outcomes.includes("not-confirmed")
      ? "unconfirmed"
      : "landed";
  return {
    // Every folder can read at the release while the record still disagrees.
    heading:
      retry && verdict === "landed"
        ? UPDATE_INCOMPLETE
        : outcomeHeading(folders.release, verdict),
    lines: folders.folders.map((folder) => ({
      key: folder.path,
      name: folder.path,
      muted: !folder.written,
      ...updatedToLine(folder, { release: folders.release, retry }),
    })),
  };
}

/** Every folder Global writes reads Not confirmed: nothing read them back. */
export function unconfirmedLines(
  folders: readonly Pick<GlobalFolderState, "path" | "tool" | "detected">[],
): FoldLine[] {
  return folders.map((folder) => ({
    key: folder.path,
    name: folder.path,
    details: [],
    step: null,
    ...(folder.detected
      ? { tone: "unknown", fact: NOT_CONFIRMED }
      : {
          tone: "neutral",
          muted: true,
          fact: notWrittenNote(toolDisplayName(folder.tool)),
        }),
  }));
}

function foldAgreeingTools(
  rows: readonly UpdateOutcomeRow[],
): UpdateOutcomeRow[] {
  const byName = new Map<string, UpdateOutcomeRow[]>();
  for (const row of rows) {
    byName.set(row.name, [...(byName.get(row.name) ?? []), row]);
  }
  return [...byName.values()].flatMap((group) => {
    const first = group[0];
    if (first === undefined) {
      return [];
    }
    return group.every((row) => row.state === first.state)
      ? [{ ...first, tool: null }]
      : group;
  });
}
