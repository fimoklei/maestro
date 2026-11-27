import type { BulkDeployReport, WriteReport } from "@maestro/core";
import {
  folderLines,
  folderReports,
  writtenToLine,
} from "../deploy-state/written-to-copy";
import type { FoldLine } from "../ui/fold-list";

export function writtenToLines(input: {
  ran: BulkDeployReport;
  report: WriteReport;
  skipped: readonly string[];
  retry: boolean;
}): FoldLine[] {
  const { ran, retry } = input;
  const stated = new Set([
    ...ran.deployed.map((row) => row.name),
    ...ran.attention.map((row) => row.name),
    ...ran.failed.flatMap((line) => line.names),
    ...input.skipped,
  ]);
  const folders = folderReports(input.report.places).map((folder) => ({
    ...folder,
    skills: folder.skills.filter((skill) => stated.has(skill.name)),
  }));
  return folderLines(folders, (folder) => writtenToLine(folder, retry));
}

export function landedByRetry(
  ran: BulkDeployReport,
  retry: { release: string; landed: readonly string[] } | null,
): { name: string; version: string }[] {
  if (retry === null) return [];
  return ran.failed
    .filter((line) => line.error === "deploy-incomplete")
    .flatMap((line) => line.names)
    .filter((name) => retry.landed.includes(name))
    .map((name) => ({ name, version: retry.release }));
}
