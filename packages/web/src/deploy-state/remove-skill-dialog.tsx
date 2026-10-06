import type { RemoveOutcome } from "@maestro/core";
import { useId } from "react";
import { Dialog } from "../ui/dialog";
import { GroupedList, type GroupedListGroup } from "../ui/grouped-list";
import { Notice, type NoticeContent } from "../ui/notice";
import { Report } from "../ui/report";
import { REMOVE_SKILL } from "./deploy-state-copy";
import type { DeployStateNotice } from "./notice-copy";
import {
  REMOVE_KEEPS,
  type RemoveDialogTarget,
  type RemoveLedgerRow,
  removeLedgerLeadIn,
  removeLedgerRows,
  removeOutcomeReport,
} from "./remove-ledger-rows";
import type { RemovePreflightView } from "./remove-preflight-view";

// Names no cost: an unfinished check has claimed nothing.
const CHECKING = "checking for local edits";

// No per-tool remove: apm's uninstall has no -t, and faking one orphans the
// other tools' files.
const ledgerGroup = (
  rows: readonly (RemoveLedgerRow & { id: string })[],
  target: RemoveDialogTarget,
): GroupedListGroup[] => [
  {
    tone: "neutral",
    legend: null,
    rows: rows.map((row) => ({
      key: row.key,
      name: row.name,
      // Named as the table names it; the full path on hover.
      ...(target.kind === "repo" ? { title: target.repoPath } : {}),
      value: row.path ?? undefined,
      sentence: row.status ?? undefined,
      tone: row.drift ? "attention" : undefined,
      id: row.id,
    })),
  },
];

// Modal confirm for removing a deployed skill; the host owns the request state.
export function RemoveSkillDialog({
  skillName,
  version,
  target,
  isRemoving,
  error,
  restated,
  outcome,
  preflight,
  onCancel,
  onConfirm,
}: {
  skillName: string;
  // Required: a caller that cannot name the version passes null.
  version: string | null;
  target: RemoveDialogTarget;
  isRemoving: boolean;
  // One prop, so the screen cannot state a warning and a refusal at once.
  preflight: RemovePreflightView;
  // A failed removal; a refused `preflight` happens before confirm.
  error: DeployStateNotice | null;
  // A removal the server did not run because the copy's cost changed; the
  // removal is still on offer.
  restated: DeployStateNotice | null;
  // Null where the probe proved nothing: an unobserved outcome is never drawn.
  outcome: RemoveOutcome | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const awaitingCheck =
    preflight.kind === "offered" &&
    preflight.check.kind === "unanswered" &&
    preflight.check.warning === "checking";
  const refused = preflight.kind === "refused";
  // At most one failure: a refusal comes before confirm, an error after it.
  const failure: NoticeContent | null =
    error !== null
      ? { ...error, level: "error" }
      : preflight.kind === "refused"
        ? { ...preflight.notice, level: "error" }
        : null;
  const report =
    error !== null && outcome !== null
      ? removeOutcomeReport(target, outcome)
      : null;

  // One id per row: a reference list joins with spaces, text in one element
  // does not reliably.
  const dialogId = useId();
  const leadInId = `${dialogId}-lead-in`;
  // No ledger after a refusal, or after a failure: the report, if any, replaces it.
  const ledgered = !refused && error === null;
  const rows = ledgered
    ? removeLedgerRows(target, preflight.reclaim, preflight.check).map(
        (row, index) => ({ ...row, id: `${dialogId}-target-${index}` }),
      )
    : [];
  const detectedRows = rows.filter((row) => !row.leftover);
  const leftoverRows = rows.filter((row) => row.leftover);

  const body =
    report !== null ? (
      <Report heading={report.heading} groups={report.groups} />
    ) : ledgered ? (
      <>
        <div className="flex flex-col gap-tight">
          {/* Not a live region: the rows below already announce themselves. */}
          <span id={leadInId} className="font-ui text-gray-11 text-meta">
            {removeLedgerLeadIn("skill")}
          </span>
          <GroupedList
            groups={ledgerGroup(detectedRows, target)}
            checklist={null}
            live="Removal targets"
          />
          {/* Mounted empty from first render: a live region created with its first
              message announces unreliably. */}
          {target.kind === "global" ? (
            <GroupedList
              groups={ledgerGroup(leftoverRows, target)}
              checklist={null}
              live="Other copies"
            />
          ) : null}
          <p className="m-0 font-ui text-gray-11 text-meta">{REMOVE_KEEPS}</p>
        </div>
        {/* Amber: nothing failed or was deleted, the price went up. It carries
            the confirm, so the footer offers none. */}
        {restated === null ? null : (
          <Notice
            trigger="user-action"
            notice={{
              ...restated,
              level: "warning",
              action: {
                label: REMOVE_SKILL,
                onClick: onConfirm,
                disabled: isRemoving,
              },
            }}
          />
        )}
      </>
    ) : null;

  return (
    <Dialog
      title={`Remove ${skillName}`}
      version={version}
      width={640}
      phase={
        isRemoving ? "running" : refused || report !== null ? "outcome" : "idle"
      }
      action={
        refused || restated !== null
          ? null
          : {
              label: REMOVE_SKILL,
              verb: "remove",
              tone: "danger",
              unavailable: awaitingCheck ? CHECKING : null,
              onRun: onConfirm,
            }
      }
      failure={failure}
      // Leftover rows arrive after open, so only their own region announces them.
      describedBy={
        ledgered
          ? [leadInId, ...detectedRows.map((row) => row.id)].join(" ")
          : null
      }
      fieldsChanged={false}
      onClose={onCancel}
    >
      {body}
    </Dialog>
  );
}
