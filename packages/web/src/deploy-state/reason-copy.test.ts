import type { BulkRemoveReport, RemoveDeployedSkillError } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { REFUSAL_REASON } from "../inventory/bulk-remove-dialog-view";
import { bulkRemoveReportView } from "../inventory/bulk-remove-report-view";
import { UPDATE_TARGET } from "../ui/control-labels";
import {
  deployNotice,
  removeNotice,
  retryNotice,
  updateNotice,
  updatePreviewNotice,
} from "./notice-copy";

// The approved reason per server code (#1459). Every surface that names one of
// these codes reads the same words.
const APPROVED: Record<string, string> = {
  "unsupported-primitive-type": "Skills only",
  "no-supported-tool": "No supported tool",
  "lockfile-malformed": "Deployment record not read",
  "deployed-unreadable": "Deployed copy not read",
  "inventory-unreadable": "Inventory not read",
  "preflight-failed": "Deployed files not checked",
  "ref-unresolvable": "Deployed version unknown",
  "cost-not-acknowledged": "Removal not confirmed",
  "deploy-in-progress": "Target busy",
  "remove-in-progress": "Target busy",
  "update-in-progress": "Target busy",
  "manifest-not-recognised": "Manifest not recognised",
  "operation-unfinished": "Unfinished operation",
  "remove-incomplete": "Removal incomplete",
  "remove-failed": "Removal outcome unknown",
};

const FALLBACKS = new Set([
  "Deploy outcome unknown",
  "Removal outcome unknown",
  "Preview outcome unknown",
  "Update outcome unknown",
]);

const refusal = (code: string) => new HttpError(422, "unused", code);

function noticeLabels(code: string): string[] {
  const error = refusal(code);
  const labels = [
    deployNotice(error).label,
    updatePreviewNotice(error, UPDATE_TARGET).label,
    updateNotice(error, UPDATE_TARGET).label,
  ].filter((label) => !FALLBACKS.has(label));
  // "Removal outcome unknown" is both the fallback and remove-failed's reason.
  const removal = removeNotice(error).label;
  return code === "remove-failed" || !FALLBACKS.has(removal)
    ? [...labels, removal]
    : labels;
}

function reportReason(code: string): string | undefined {
  const target = { kind: "global" } as const;
  const report: BulkRemoveReport = {
    name: "tdd",
    removed: [],
    refused: [],
    // The report carries the server's code as sent, so any approved code
    // stands in; the table it reads is the one every surface shares.
    failed: [{ target, reason: code as RemoveDeployedSkillError }],
  };
  const view = bulkRemoveReportView({
    targets: [{ target, label: "global", version: "v1.0.0" }],
    report,
  });
  const reason = view?.kind === "report" ? view.leftAlone[0]?.reason : "";
  // An unrecognised code falls back to itself.
  return reason === code ? undefined : reason;
}

const REFUSAL_REASONS = new Map(Object.entries(REFUSAL_REASON));

describe("one reason per server code", () => {
  it.each(Object.entries(APPROVED))(
    "%s reads %j on every surface that names it",
    (code, label) => {
      const seen = [
        ...noticeLabels(code),
        reportReason(code),
        REFUSAL_REASONS.get(code),
      ].filter((reason) => reason !== undefined);

      expect(seen.length).toBeGreaterThan(0);
      expect(new Set(seen)).toEqual(new Set([label]));
    },
  );

  it("heads a retry blocked by a running operation Target busy", () => {
    expect(
      retryNotice(refusal("retry-in-progress"), {
        kind: "deploy",
        release: "v1.0.0",
      }).label,
    ).toBe("Target busy");
  });
});
