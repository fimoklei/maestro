// What an Update did, as a Report. A repository states its failures per skill,
// per tool only where the tools disagree; Global states one fact per Global
// folder.
import type {
  ReportSkillState,
  SupportedTool,
  WriteReport,
} from "@maestro/core";
import type { FoldLine } from "../ui/fold-list";
import type { ReportGroup } from "../ui/report";
import {
  consentRowName,
  outcomeDetail,
  outcomeHeading,
  type UnlandedState,
  UPDATE_INCOMPLETE,
} from "./update-target-copy";
import {
  folderLines,
  folderReports,
  type GlobalFolderRef,
  unconfirmedLine,
  updatedToLine,
} from "./written-to-copy";

export type UpdateRow = {
  name: string;
  tool: SupportedTool | null;
  state: ReportSkillState;
};

/** What the dialog shows once an update ran. */
export type UpdateRunView =
  | { kind: "skills"; rows: readonly UpdateRow[] }
  | { kind: "folders"; report: WriteReport }
  // Global, where nothing read the folders back.
  | { kind: "unknown" };

export const updateRows = (report: WriteReport): UpdateRow[] =>
  report.places.flatMap((place) =>
    place.skills.map((skill) => ({
      name: skill.name,
      tool: place.tool,
      state: skill.state,
    })),
  );

export function updateOutcomeReport(input: {
  rows: readonly UpdateRow[];
  releases: { from: string; to: string };
  /** Retry update is on screen, so a failure names it as the next step. */
  retry: boolean;
}): { heading: string; groups: ReportGroup[] } {
  const { releases, retry } = input;
  const rows = foldAgreeingTools(input.rows);
  const inState = <S extends UnlandedState>(...states: S[]) =>
    rows.filter((row): row is UpdateRow & { state: S } =>
      // Widened only to ask includes() about any state.
      (states as ReportSkillState[]).includes(row.state),
    );
  const detailed = (row: UpdateRow & { state: UnlandedState }) => ({
    name: consentRowName(row),
    detail: outcomeDetail(row.state, releases, retry),
  });

  const failed = inState("not-updated", "missing", "not-removed").map(detailed);
  const unknown = inState("not-confirmed").map(detailed);
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
  report: WriteReport;
  /** The update did not finish: Retry update is in the footer, and a deviating folder names it. */
  retry: boolean;
}): { heading: string; lines: FoldLine[] } {
  const { report, retry } = input;
  const release = report.release ?? "";
  const folders = folderReports(report.places);
  const states = folders.flatMap((folder) =>
    folder.skills.map((skill) => skill.state),
  );
  const verdict = states.some(
    (state) => state === "missing" || state === "not-updated",
  )
    ? "failed"
    : states.includes("not-confirmed")
      ? "unconfirmed"
      : "landed";
  return {
    // Every folder can read at the release while the record still disagrees.
    heading:
      retry && verdict === "landed"
        ? UPDATE_INCOMPLETE
        : outcomeHeading(release, verdict),
    lines: folderLines(folders, (folder) =>
      updatedToLine(folder, { release, retry }),
    ),
  };
}

/** Every folder Global writes reads Not confirmed: nothing read them back. */
export const unconfirmedLines = (
  folders: readonly GlobalFolderRef[],
): FoldLine[] => folderLines(folders, () => unconfirmedLine);

function foldAgreeingTools(rows: readonly UpdateRow[]): UpdateRow[] {
  const byName = new Map<string, UpdateRow[]>();
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
