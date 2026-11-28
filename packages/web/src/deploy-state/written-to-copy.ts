// A Global Report's `Written to` list: one fact per Global folder, and the
// skills a deviating folder did not get.
import type {
  GlobalFolderState,
  ReportPlace,
  ReportSkill,
} from "@maestro/core";
import type { FoldLine } from "../ui/fold-list";
import type { StatusFamily } from "../ui/status-family";
import { notWrittenNote } from "./deploy-state-copy";
import { toolDisplayName } from "./tool-presentation";
import { RETRY_UPDATE_STEP } from "./update-target-copy";

export const WRITTEN_TO = "Written to";
const NOT_CONFIRMED = "Not confirmed";
const NOT_WRITTEN = "Not written";

type Detail = { label: string; value: string };

export type WrittenToLine = {
  tone: StatusFamily;
  fact: string;
  /** Label | value rows; a folder with none does not fold. */
  details: Detail[];
  step: string | null;
};

const skills = (n: number) => `${n} ${n === 1 ? "skill" : "skills"}`;

export type FolderReport = ReportPlace & { path: string };

export const folderReports = (places: readonly ReportPlace[]): FolderReport[] =>
  places.flatMap((place) =>
    place.path === null ? [] : [{ ...place, path: place.path }],
  );

const LANDED: readonly ReportSkill["state"][] = [
  "written",
  "already-at-release",
];

function detail(skill: ReportSkill): Detail | null {
  switch (skill.state) {
    case "written":
    case "already-at-release":
    case "removed":
      return null;
    case "refused":
      return { label: NOT_WRITTEN, value: skill.name };
    case "not-removed":
      return { label: "Not removed", value: skill.name };
    case "missing":
      return { label: "Missing", value: skill.name };
    case "not-confirmed":
      return { label: NOT_CONFIRMED, value: skill.name };
    case "not-updated":
      return {
        label: "Not updated",
        value:
          skill.stillAt === null
            ? skill.name
            : `${skill.name} · still at ${skill.stillAt}`,
      };
  }
}

/** A Global folder as a dialog names it: by path, with whether Global writes it. */
export type GlobalFolderRef = Pick<
  GlobalFolderState,
  "path" | "tool" | "detected" | "former"
>;

const notWrittenLine = (folder: GlobalFolderRef): WrittenToLine => ({
  tone: "neutral",
  fact: notWrittenNote(toolDisplayName(folder.tool)),
  details: [],
  step: null,
});

/**
 * One line per Global folder. `line` states a folder the write reached; a
 * folder it skipped reads muted, naming its undetected tool.
 */
export function folderLines<F extends GlobalFolderRef>(
  folders: readonly F[],
  line: (folder: F) => WrittenToLine,
): FoldLine[] {
  return folders
    .filter((folder) => folder.former !== true)
    .map((folder) => ({
      key: folder.path,
      name: folder.path,
      ...(folder.detected
        ? line(folder)
        : { muted: true, ...notWrittenLine(folder) }),
    }));
}

/** A folder a deploy held by local edits wrote nothing to. */
export const heldLine = (held: number): WrittenToLine => ({
  tone: "neutral",
  fact: `0 of ${skills(held)} deployed`,
  details: [],
  step: null,
});

/** Every folder Global writes reads Not confirmed: nothing read them back. */
export const unconfirmedLine: WrittenToLine = {
  tone: "unknown",
  fact: NOT_CONFIRMED,
  details: [],
  step: null,
};

/** `retry`: Retry deploy is in the footer, so a deviating folder asks for it. */
export function writtenToLine(
  folder: FolderReport,
  retry: boolean,
): WrittenToLine {
  return folderLine(folder, {
    clean: `${skills(folder.skills.length)} deployed`,
    step: retry ? "Retry the deploy to run it again." : null,
  });
}

/** The same words after Update target; `retry`: Retry update is in the footer. */
export function updatedToLine(
  folder: FolderReport,
  update: { release: string; retry: boolean },
): WrittenToLine {
  const line = folderLine(folder, {
    clean: `At ${update.release}`,
    step: update.retry ? RETRY_UPDATE_STEP : null,
  });
  const notUpdated = folder.skills.filter(
    (skill) => skill.state === "not-updated",
  ).length;
  const written = folder.skills.filter((skill) =>
    LANDED.includes(skill.state),
  ).length;
  return notUpdated > 0 && written + notUpdated === folder.skills.length
    ? { ...line, fact: `${skills(notUpdated)} not updated` }
    : line;
}

function folderLine(
  folder: FolderReport,
  words: {
    clean: string;
    step: string | null;
  },
): WrittenToLine {
  if (!folder.detected) {
    return notWrittenLine(folder);
  }
  const total = folder.skills.length;
  const count = (states: readonly ReportSkill["state"][]) =>
    folder.skills.filter((skill) => states.includes(skill.state)).length;
  const written = count(LANDED);
  const missing = count(["missing"]);
  const unconfirmed = count(["not-confirmed"]);
  if (written === total) {
    return {
      tone: "good",
      fact: words.clean,
      details: [],
      step: null,
    };
  }
  if (unconfirmed === total) {
    return unconfirmedLine;
  }
  const details = folder.skills.flatMap((skill) => detail(skill) ?? []);
  return {
    tone: written + unconfirmed === total ? "unknown" : "failed",
    fact:
      written + missing === total
        ? missing === total
          ? `${skills(total)} missing`
          : `${missing} of ${skills(total)} missing`
        : `${written} of ${skills(total)} deployed`,
    details,
    step: words.step,
  };
}
