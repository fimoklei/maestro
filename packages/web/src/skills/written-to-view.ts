// A Global deploy's per-folder outcome, folded into its Report: the folders
// state what each got, so an unfinished install is no Failed row of its own.
import type { BulkDeployReport, FolderOutcomes } from "@maestro/core";
import { folderLines, writtenToLine } from "../deploy-state/written-to-copy";
import type { FoldLine } from "../ui/fold-list";

type WrittenToView = {
  /** Skills every written folder holds at the release. */
  deployed: { name: string; version: string }[];
  failed: BulkDeployReport["failed"];
  lines: FoldLine[];
};

/**
 * `outcome`: the latest read of the folders, the run's or its retry's.
 * `skipped`: skills the Report counts as up to date; the folders state them too.
 */
export function writtenToView(input: {
  report: BulkDeployReport;
  outcome: FolderOutcomes;
  skipped: readonly string[];
  retry: boolean;
}): WrittenToView {
  const { report, outcome, retry } = input;
  const ran = new Set([
    ...report.deployed.map((row) => row.name),
    ...report.attention.map((row) => row.name),
    ...report.failed.flatMap((line) => line.names),
    ...input.skipped,
  ]);
  const folders = outcome.folders.map((folder) => ({
    ...folder,
    skills: folder.skills.filter((skill) => ran.has(skill.name)),
  }));
  const writtenEverywhere = (name: string) =>
    folders.every(
      (folder) =>
        !folder.detected ||
        folder.skills.some(
          (skill) => skill.name === name && skill.outcome === "written",
        ),
    );
  const unfinished = report.failed
    .filter((line) => line.error === "deploy-incomplete")
    .flatMap((line) => line.names);
  return {
    deployed: unfinished
      .filter(writtenEverywhere)
      .map((name) => ({ name, version: outcome.release })),
    failed: report.failed.filter((line) => line.error !== "deploy-incomplete"),
    lines: folderLines(folders, (folder) => writtenToLine(folder, retry)),
  };
}
