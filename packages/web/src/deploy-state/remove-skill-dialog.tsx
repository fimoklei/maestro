import type { RemoveOutcome, RemoveTargetState } from "@maestro/core";
import { useId } from "react";
import { TYPE_WORD } from "../inventory/type-filter";
import { ACTIONS } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { DIALOG_CANCEL, DIALOG_FOOTER, DialogShell } from "../ui/dialog-shell";
import { Notice } from "../ui/notice";
import { panelBorderFor } from "../ui/panel-border";
import type { DeployStateNotice } from "./notice-copy";
import {
  type RemoveDialogTarget,
  type RemoveLedgerRow,
  removeLedgerLeadIn,
  removeLedgerRows,
} from "./remove-ledger-rows";
import type { RemovePreflightView } from "./remove-preflight-view";

// Names no cost, so no amber and no ▲: an unfinished check has claimed nothing.
const CHECKING_TEXT = "Checking this copy for local edits…";

type LedgerRowPlacement = { id: string; last: boolean };

// Must survive without colour. "unknown" means the probe could not answer,
// which is not the same as still being there.
const OUTCOME_TEXT: Record<RemoveTargetState, string> = {
  removed: "Removed",
  "not-removed": "Not removed",
  unknown: "Outcome unknown",
};

const OUTCOME_GLYPH: Record<RemoveTargetState, string> = {
  removed: "✓",
  "not-removed": "✕",
  unknown: "?",
};

const OUTCOME_INK: Record<RemoveTargetState, string> = {
  removed: "text-green-12",
  "not-removed": "text-red-12",
  unknown: "text-gray-11",
};

const OUTCOME_ROW: Record<RemoveTargetState, string> = {
  removed: "bg-gray-3",
  "not-removed": "bg-red-3",
  unknown: "bg-gray-3",
};

// One fill per row, never two — `cn` concatenates, so a second bg- utility
// would leave the winner to stylesheet order.
function rowFill(row: RemoveLedgerRow): string {
  if (row.outcome !== null) {
    return OUTCOME_ROW[row.outcome];
  }
  return row.drift ? "bg-amber-3" : "bg-gray-3";
}

// Never both: a row with an outcome carries no cost (#416).
function RowStatus({ row }: { row: RemoveLedgerRow }) {
  if (row.outcome !== null) {
    return (
      <span
        className={cn("shrink-0 font-ui text-meta", OUTCOME_INK[row.outcome])}
      >
        <span aria-hidden="true" className="font-mono">
          {OUTCOME_GLYPH[row.outcome]}
        </span>{" "}
        {OUTCOME_TEXT[row.outcome]}
      </span>
    );
  }
  return row.status === null ? null : (
    <span className="shrink-0 font-ui text-amber-12 text-meta">
      {row.status}
    </span>
  );
}

// No per-tool remove: apm's uninstall has no -t, and faking one orphans the
// other tools' files.
function LedgerRow({ row }: { row: RemoveLedgerRow & LedgerRowPlacement }) {
  const outcome = row.outcome;
  return (
    <li
      id={row.id}
      className={cn(
        "flex items-baseline gap-1.5 px-3 py-2.5",
        row.last ? null : "border-gray-6 border-b",
        rowFill(row),
      )}
    >
      {row.drift ? (
        <span aria-hidden="true" className="font-mono text-amber-11 text-meta">
          ▲
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "break-all font-mono text-row",
            outcome === "removed" ? "text-gray-11" : "text-gray-12",
          )}
        >
          {row.name}
        </span>
        {row.path === null ? null : (
          <span className="break-all font-mono text-gray-12 text-meta">
            {row.path}
          </span>
        )}
      </div>
      <RowStatus row={row} />
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
  const named = version === null ? skillName : `${skillName} ${version}`;
  const heading = `Remove ${named}`;
  const type = "skill" as const;
  const awaitingCheck =
    preflight.kind === "offered" &&
    preflight.check.kind === "unanswered" &&
    preflight.check.warning === "checking";
  const refused = preflight.kind === "refused";
  const failed = error !== null;
  const failure = refused || failed;

  // One id per row: a reference list joins with spaces, text in one element
  // does not reliably.
  const dialogId = useId();
  const leadInId = `${dialogId}-lead-in`;
  const refusalId = `${dialogId}-refusal`;
  // No ledger after a refusal, or after a failure the server proved nothing about.
  const unledgered = refused || (failed && outcome === null);
  const rows = unledgered
    ? []
    : removeLedgerRows(target, preflight.reclaim, preflight.check, outcome).map(
        (row, index, all) => ({
          ...row,
          id: `${dialogId}-target-${index}`,
          last: index === all.length - 1,
        }),
      );
  const detectedRows = rows.filter((row) => !row.leftover);
  const leftoverRows = rows.filter((row) => row.leftover);
  // Leftover rows arrive after open, so only their own region announces them.
  const describedBy = refused
    ? refusalId
    : unledgered
      ? null
      : [leadInId, ...detectedRows.map((row) => row.id)].join(" ");
  const blockedId = awaitingCheck ? `${dialogId}-blocked` : undefined;
  const panelBorder = panelBorderFor({
    failure,
    cost: rows.some((row) => row.drift),
  });

  return (
    // Closing is blocked mid-removal: the outcome is readable nowhere else.
    <DialogShell
      label={heading}
      describedBy={describedBy}
      width={480}
      border={panelBorder}
      destructive
      onClose={onCancel}
      closeEnabled={!isRemoving}
    >
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-gray-7 border-b px-3.5 py-3">
        <h2 className="font-semibold font-ui text-gray-12 text-prose">
          Remove <span className="font-mono">{named}</span>
        </h2>
        <span className="shrink-0 text-gray-11 text-meta">
          {TYPE_WORD[type]}
        </span>
      </div>

      {/* A long ledger scrolls rather than push the footer off. */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {unledgered ? null : (
          <div className="flex flex-col gap-2">
            {/* Not a live region: the rows below already announce the outcome. */}
            <span id={leadInId} className="font-ui text-meta text-gray-11">
              {removeLedgerLeadIn(outcome, type)}
            </span>
            <div className="flex flex-col overflow-hidden rounded-control border border-gray-7">
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
        )}

        <div className="flex flex-col gap-2">
          <Notice
            id={refusalId}
            trigger="user-action"
            notice={
              preflight.kind === "refused"
                ? { ...preflight.notice, level: "error" }
                : null
            }
          />
          {/* Amber: nothing failed or was deleted, the price went up. */}
          <Notice
            trigger="user-action"
            notice={
              restated
                ? {
                    ...restated,
                    level: "warning",
                    action: {
                      label: "Remove skill",
                      onClick: onConfirm,
                      disabled: isRemoving,
                    },
                  }
                : null
            }
          />
          <Notice
            trigger="user-action"
            notice={error ? { ...error, level: "error" } : null}
          />
        </div>
      </div>

      <div className={DIALOG_FOOTER}>
        <Button
          type="button"
          className="shrink-0"
          variant="quiet"
          disabled={isRemoving}
          {...DIALOG_CANCEL}
          onClick={onCancel}
        >
          {failure ? "Close" : "Cancel"}
        </Button>
        <div className="flex min-w-0 items-center gap-inline">
          {/* Beside the control it holds, not in the body: keeps panel height
              steady between "checking" and the answer, so confirm doesn't jump. */}
          {awaitingCheck ? (
            <p
              id={blockedId}
              role="status"
              aria-label="Local edits check"
              className="min-w-0 truncate font-ui text-meta text-gray-11"
            >
              {CHECKING_TEXT}
            </p>
          ) : null}
          {/* Absent while a restated price is on screen: that block carries the
              confirm. */}
          {refused || restated !== null ? null : (
            <Button
              type="button"
              className="shrink-0"
              variant="danger"
              busy={isRemoving}
              disabled={awaitingCheck}
              aria-describedby={blockedId}
              onClick={onConfirm}
            >
              {isRemoving
                ? ACTIONS.remove.busy
                : failed
                  ? "Confirm removal"
                  : "Remove skill"}
            </Button>
          )}
        </div>
      </div>
    </DialogShell>
  );
}
