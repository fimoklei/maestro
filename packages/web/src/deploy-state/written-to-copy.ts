// A Global Report's `Written to` list: one fact per Global folder, and the
// skills a deviating folder did not get.
import type { FolderOutcome, SkillOutcome } from "@maestro/core";
import type { StatusFamily } from "../ui/status-family";
import { notWrittenNote } from "./deploy-state-copy";
import { RETRY_DEPLOY } from "./release-head-copy";
import { toolDisplayName } from "./tool-presentation";

export const WRITTEN_TO = "Written to";

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
      return { label: "Not confirmed", value: skill.name };
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

/** A folder a deploy held by local edits wrote nothing to. */
export function heldLine(
  folder: Pick<FolderOutcome, "tool"> & { detected: boolean },
  held: number,
): WrittenToLine {
  return {
    tone: "neutral",
    fact: folder.detected
      ? `0 of ${skills(held)} deployed`
      : notWrittenNote(toolDisplayName(folder.tool)),
    details: [],
    step: null,
  };
}

/** `retry`: Retry deploy is in the footer, so a deviating folder names it. */
export function writtenToLine(
  folder: FolderOutcome,
  retry: boolean,
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
      fact: `${skills(total)} written`,
      details: [],
      step: null,
    };
  }
  if (unconfirmed === total) {
    return { tone: "unknown", fact: "Not confirmed", details: [], step: null };
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
    step: retry
      ? `Select ${RETRY_DEPLOY} to write ${details.length === 1 ? "it" : "them"} again.`
      : null,
  };
}
