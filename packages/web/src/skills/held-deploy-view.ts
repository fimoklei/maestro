// A Global deploy that local edits on a deployed skill held whole: nothing
// reached any folder, and one footer Deploy again carries every held row's
// receipt (#952).
import type { BulkDeployReport, HeldSkill } from "@maestro/core";
import {
  folderLines,
  type GlobalFolderRef,
  heldLine,
} from "../deploy-state/written-to-copy";
import type { FoldLine } from "../ui/fold-list";
import type { NoticeContent } from "../ui/notice";
import { heldDeployNotice } from "./held-deploy-copy";

export type HeldDeployView = {
  /** Every skill the hold kept back, a skipped one with the edits included. */
  names: string[];
  /** The rows Deploy again sends, each with its own receipt. */
  held: HeldSkill[];
  notice: NoticeContent;
  lines: FoldLine[];
};

/**
 * Null unless every row of a Global run that wrote nothing is held by local
 * edits. `skipped`: the skills the plan did not send as already up to date.
 */
export function heldDeployView(
  report: BulkDeployReport,
  folders: readonly GlobalFolderRef[],
  skipped: readonly string[],
): HeldDeployView | null {
  const rows = report.attention;
  const isHold =
    report.target.kind === "global" &&
    report.deployed.length === 0 &&
    report.outcome === undefined &&
    rows.length > 0 &&
    rows.every(
      (row) =>
        row.error === "deployed-diverged-from-lock" &&
        row.copyReceipt !== undefined &&
        row.blockingCopies !== undefined &&
        row.blockingCopies.length > 0 &&
        row.blockingCopies.every((copy) => copy.verdict === "local-edits"),
    );
  if (!isHold) return null;
  const edited = [
    ...new Set(
      rows.flatMap((row) => (row.blockingCopies ?? []).map((c) => c.name)),
    ),
  ];
  // A skill the plan skipped as current by release, whose own edits hold the
  // run: Deploy again replaces its copy too, so it is no up-to-date skill.
  const names = [
    ...rows.map((row) => row.name),
    ...skipped.filter((name) => edited.includes(name)),
  ];
  return {
    names,
    held: rows.map((row) => ({
      name: row.name,
      confirmedCopyReceipt: row.copyReceipt ?? "",
    })),
    notice: {
      level: "warning",
      ...heldDeployNotice({ edited, held: names }),
    },
    lines: folderLines(folders, () => heldLine(names.length)),
  };
}
