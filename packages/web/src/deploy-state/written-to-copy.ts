// A Global Report's `Written to` list: one fact per Global folder, and the
// skills a deviating folder did not get.
import type { FolderOutcome, SkillOutcome } from "@maestro/core";
import type { StatusFamily } from "../ui/status-family";
import { notWrittenNote } from "./deploy-state-copy";
import { RETRY_DEPLOY } from "./release-head-copy";
import { toolDisplayName } from "./tool-presentation";
import { RETRY_UPDATE_STEP } from "./update-target-copy";

export const WRITTEN_TO = "Written to";
export const NOT_CONFIRMED = "Not confirmed";

type Detail = { label: string; value: string };

export type WrittenToLine = {
  tone: StatusFamily;
  fact: string;
  /** Label | value rows; a folder with none does not fold. */
  details: Detail[];
  step: string | null;
};

const skills = (n: number) => `${n} ${n === 1 ? "skill" : "skills"}`;

function detail(skill: SkillOutcome): Detail | null {
  switch (skill.outcome) {
    case "written":
      return null;
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

/** `retry`: Retry deploy is in the footer, so a deviating folder names it. */
export function writtenToLine(
  folder: FolderOutcome,
  retry: boolean,
): WrittenToLine {
  return folderLine(folder, {
    clean: `${skills(folder.skills.length)} written`,
    step: (details) =>
      retry
        ? `Select ${RETRY_DEPLOY} to write ${details.length === 1 ? "it" : "them"} again.`
        : null,
  });
}

/** The same words after Update target; `retry`: Retry update is in the footer. */
export function updatedToLine(
  folder: FolderOutcome,
  update: { release: string; retry: boolean },
): WrittenToLine {
  const line = folderLine(folder, {
    clean: `At ${update.release}`,
    step: () => (update.retry ? RETRY_UPDATE_STEP : null),
  });
  const notUpdated = folder.skills.filter(
    (skill) => skill.outcome === "not-updated",
  ).length;
  const written = folder.skills.filter(
    (skill) => skill.outcome === "written",
  ).length;
  return notUpdated > 0 && written + notUpdated === folder.skills.length
    ? { ...line, fact: `${skills(notUpdated)} not updated` }
    : line;
}

function folderLine(
  folder: FolderOutcome,
  words: {
    clean: string;
    step: (details: readonly Detail[]) => string | null;
  },
): WrittenToLine {
  if (!folder.written) {
    return {
      tone: "neutral",
      fact: notWrittenNote(toolDisplayName(folder.tool)),
      details: [],
      step: null,
    };
  }
  const total = folder.skills.length;
  const count = (outcome: SkillOutcome["outcome"]) =>
    folder.skills.filter((skill) => skill.outcome === outcome).length;
  const written = count("written");
  const missing = count("missing");
  const unconfirmed = count("not-confirmed");
  if (written === total) {
    return {
      tone: "good",
      fact: words.clean,
      details: [],
      step: null,
    };
  }
  if (unconfirmed === total) {
    return { tone: "unknown", fact: NOT_CONFIRMED, details: [], step: null };
  }
  const details = folder.skills.flatMap((skill) => detail(skill) ?? []);
  return {
    tone: written + unconfirmed === total ? "unknown" : "failed",
    fact:
      written + missing === total
        ? missing === total
          ? `${skills(total)} missing`
          : `${missing} of ${skills(total)} missing`
        : `${written} of ${skills(total)} written`,
    details,
    step: words.step(details),
  };
}
