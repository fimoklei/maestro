import type { RemoveOutcome } from "@maestro/core";
import { useId } from "react";
import { cn } from "../ui/cn";
import { Dialog } from "../ui/dialog";
import { Notice, type NoticeContent } from "../ui/notice";
import { Report } from "../ui/report";
import type { DeployStateNotice } from "./notice-copy";
import {
  type RemoveDialogTarget,
  type RemoveLedgerRow,
  removeLedgerLeadIn,
  removeLedgerRows,
  removeOutcomeReport,
} from "./remove-ledger-rows";
import type { RemovePreflightView } from "./remove-preflight-view";

const REMOVE_SKILL = "Remove skill";
// Names no cost: an unfinished check has claimed nothing.
const CHECKING = "checking for local edits";

type LedgerRowPlacement = { id: string; last: boolean };

// No per-tool remove: apm's uninstall has no -t, and faking one orphans the
// other tools' files.
function LedgerRow({ row }: { row: RemoveLedgerRow & LedgerRowPlacement }) {
  return (
    <li
      id={row.id}
      className={cn(
        "flex items-baseline gap-tight px-cell py-cell",
        row.last ? null : "border-divider border-b",
        row.drift ? "bg-amber-3" : "bg-gray-3",
      )}
    >
      {row.drift ? (
        <span aria-hidden="true" className="font-mono text-amber-11 text-meta">
          ▲
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-tight">
        <span className="break-all font-mono text-gray-12 text-row">
          {row.name}
        </span>
        {row.path === null ? null : (
          <span className="break-all font-mono text-gray-12 text-meta">
            {row.path}
          </span>
        )}
      </div>
      {row.status === null ? null : (
        <span className="shrink-0 font-ui text-amber-12 text-meta">
          {row.status}
        </span>
      )}
    </li>
  );
}

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
        (row, index, all) => ({
          ...row,
          id: `${dialogId}-target-${index}`,
          last: index === all.length - 1,
        }),
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
          <div className="flex flex-col overflow-hidden rounded-control border border-edge">
            {/* Named apart, or a reader hears identical regions. */}
            <div role="status" aria-label="Removal targets">
              <ul className="flex flex-col">
                {detectedRows.map((row) => (
                  <LedgerRow key={row.key} row={row} />
                ))}
              </ul>
            </div>
            {/* Mounted empty from first render: a live region created with its first
                message announces unreliably. */}
            {target.kind === "global" ? (
              <div role="status" aria-label="Other copies">
                {leftoverRows.length > 0 ? (
                  <ul className="flex flex-col">
                    {leftoverRows.map((row) => (
                      <LedgerRow key={row.key} row={row} />
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
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
