import type { ReportSkill, WriteReport } from "@maestro/core";
import { HttpError } from "../api/http";
import { isSupportedTool } from "./tool-presentation";

type Fields = { [key: string]: unknown };

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null;

const PLAIN_STATES: readonly string[] = [
  "written",
  "already-at-release",
  "missing",
  "not-confirmed",
  "removed",
  "not-removed",
];

function isReportSkill(skill: unknown): skill is ReportSkill {
  if (!isFields(skill) || typeof skill.name !== "string") return false;
  switch (skill.state) {
    case "not-updated":
      return skill.stillAt === null || typeof skill.stillAt === "string";
    case "refused":
      return typeof skill.reason === "string";
    default:
      return PLAIN_STATES.includes(String(skill.state));
  }
}

function isWriteReport(report: unknown): report is WriteReport {
  return (
    isFields(report) &&
    (report.release === null || typeof report.release === "string") &&
    Array.isArray(report.places) &&
    report.places.every(
      (place: unknown) =>
        isFields(place) &&
        isSupportedTool(place.tool) &&
        (place.path === null || typeof place.path === "string") &&
        typeof place.detected === "boolean" &&
        Array.isArray(place.skills) &&
        place.skills.every(isReportSkill),
    )
  );
}

export function writeReportIn(error: unknown): WriteReport | null {
  const report =
    error instanceof HttpError && isFields(error.body)
      ? error.body.report
      : undefined;
  return isWriteReport(report) ? report : null;
}
