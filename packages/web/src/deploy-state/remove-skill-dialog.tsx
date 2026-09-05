import type { RemoveOutcome, RemoveTargetState } from "@maestro/core";
import { useId } from "react";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { DialogShell } from "../ui/dialog-shell";
import { Notice } from "../ui/notice";
import { panelBorderFor } from "../ui/panel-border";
import { TypeTag } from "../ui/type-tag";
import type { DeployStateNotice } from "./notice-copy";
import {
  type RemoveDialogTarget,
  type RemoveLedgerRow,
  removeLedgerLeadIn,
  removeLedgerRows,
} from "./remove-ledger-rows";
import type { RemovePreflightView } from "./remove-preflight-view";

// Silence would read as nothing-to-lose, the one thing an unfinished check
// cannot promise (J04) — it names no cost, so no amber and no ▲ (deployed-view.ts).
const CHECKING_TEXT = "Checking this copy for local edits…";

type LedgerRowPlacement = { id: string; last: boolean };

// What the server proved about one target, in a word and a glyph — the outcome
// must survive without colour perception (Never-Colour-Alone). "unknown" says
// the probe could not answer, which is not the same as still being there.
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
  removed: "text-green-ink",
  "not-removed": "text-danger-ink",
  unknown: "text-dim",
};

// A target the removal came off has nothing left to act on, so it recedes; one
// it did not keeps its weight and takes the danger fill.
const OUTCOME_ROW: Record<RemoveTargetState, string> = {
  removed: "bg-inset",
  "not-removed": "bg-danger-bg",
  unknown: "bg-inset",
};

// One fill per row, never two — `cn` concatenates, so a second bg- utility
// would leave the winner to stylesheet order.
function rowFill(row: RemoveLedgerRow): string {
  if (row.outcome !== null) {
    return OUTCOME_ROW[row.outcome];
  }
  return row.drift ? "bg-amber-bg" : "bg-inset";
}

// The right-hand slot: a cost the removal has yet to charge, or the outcome it
// already had. Never both — a row with an outcome carries no cost (#416).
function RowStatus({ row }: { row: RemoveLedgerRow }) {
  if (row.outcome !== null) {
    return (
      <span
        className={cn(
          "shrink-0 font-ui text-mono-sm",
          OUTCOME_INK[row.outcome],
        )}
      >
        <span aria-hidden="true" className="font-mono">
          {OUTCOME_GLYPH[row.outcome]}
        </span>{" "}
        {OUTCOME_TEXT[row.outcome]}
      </span>
    );
  }
  return row.status === null ? null : (
    <span className="shrink-0 font-ui text-amber-ink text-mono-sm">
      {row.status}
    </span>
  );
}

// apm's uninstall has no -t; faking one orphans the other tools' files
// (apm-behavior.md § Remove, ADR-0013).
function LedgerRow({ row }: { row: RemoveLedgerRow & LedgerRowPlacement }) {
  const outcome = row.outcome;
  return (
    <li
      id={row.id}
      className={cn(
        "flex items-baseline gap-1.5 px-3 py-2.5",
        row.last ? null : "border-line-faint border-b",
        rowFill(row),
      )}
    >
      {row.drift ? (
        <span aria-hidden="true" className="font-mono text-amber-ink text-desc">
          ▲
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* A target the removal came off has nothing left to act on, so it
            recedes; every other row keeps its weight. */}
        <span
          className={cn(
            "break-all font-mono text-data",
            outcome === "removed" ? "text-muted" : "text-fg",
          )}
        >
          {row.name}
        </span>
        {row.path === null ? null : (
          <span className="break-all font-mono text-fg-2 text-mono-sm">
            {row.path}
          </span>
        )}
      </div>
      <RowStatus row={row} />
    </li>
  );
}

// A real modal, not an inline confirm — removal deletes files. Modal contract
// (focus, Escape, trapped Tab) comes from useModalDialog. Presentational: the
// host owns the request, the in-flight flag and the error text.
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
  // Required, not optional: a caller that cannot name the version says so,
  // rather than dropping it by omission.
  version: string | null;
  target: RemoveDialogTarget;
  isRemoving: boolean;
  // A warning informs and never blocks (#337); a refusal means there's nothing
  // to consent to (#385). One prop, so the screen can't state both at once.
  preflight: RemovePreflightView;
  // The notice for a refused/failed removal, not the same as a refused
  // `preflight` (which happens before there's anything to confirm).
  error: DeployStateNotice | null;
  // The notice for a removal the server took no action on, because nothing
  // showed the request agreed to what the copy costs now. Apart from `error`:
  // the ledger states that cost, and the removal is still on offer.
  restated: DeployStateNotice | null;
  // What the server's own probe proved about each target after that failure.
  // Null where it proved nothing: an outcome nobody observed is never drawn.
  outcome: RemoveOutcome | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const named = version === null ? skillName : `${skillName} ${version}`;
  // No question mark: the standard bans a question as a heading, and the
  // accessible name states the same words as the visible one (R-A).
  const heading = `Remove ${named}`;
  // Only skills reach this dialog today — DeployedPrimitive.type is the literal
  // "skill" — so the type is stated once here, never guessed twice below.
  const type = "skill" as const;
  // Holds the confirm until the check answers — J04 applied to consent, not a
  // second guard on top of #337's decision.
  const awaitingCheck =
    preflight.kind === "offered" &&
    preflight.check.kind === "unanswered" &&
    preflight.check.warning === "checking";
  // A refusal drops both halves of the consent it was asking for: confirm and
  // ledger. What's left is the question and the server's reason (#412).
  const refused = preflight.kind === "refused";
  // A removal already confirmed once that apm did not land. The footer then
  // offers the same attempt again: a `remove →` beside a failure describes a
  // dialog where nothing has happened yet (#415).
  const failed = error !== null;
  // Everything the panel states differently once its news is bad.
  const failure = refused || failed;

  // One id per row, not one wrapping the ledger: a list of references joins
  // with a space by definition; text inside one element doesn't reliably.
  const dialogId = useId();
  const leadInId = `${dialogId}-lead-in`;
  const refusalId = `${dialogId}-refusal`;
  // Neither failure leaves a ledger to draw. A refusal: nothing is going, and
  // leftovers an earlier answer named cannot outlive it. A failure the server
  // proved nothing about: the rows would price a removal that already ran (#416).
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
  // Leftover rows arrive with the answer, so the description (read once, at
  // open) would miss them — their region is their only channel.
  const describedBy = refused
    ? refusalId
    : unledgered
      ? null
      : [leadInId, ...detectedRows.map((row) => row.id)].join(" ");
  // Ties the disabled reason to the control (same wiring as browse dialog's
  // `↑ up`). Only for the running check — a refusal removes the control instead.
  const blockedId = awaitingCheck ? `${dialogId}-blocked` : undefined;
  // The outline states the panel's worst news, and a cost is now a property of
  // the rows rather than of a block beside them.
  const panelBorder = panelBorderFor({
    failure,
    cost: rows.some((row) => row.drift),
  });

  return (
    // Closing is blocked while the removal is in flight — the outcome is
    // readable nowhere else.
    <DialogShell
      label={heading}
      describedBy={describedBy}
      width={480}
      border={panelBorder}
      onClose={onCancel}
      closeEnabled={!isRemoving}
    >
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-line-row border-b px-3.5 py-3">
        <h2 className="font-semibold font-ui text-fg text-subtitle">
          Remove <span className="font-mono">{named}</span>
        </h2>
        <TypeTag type={type} className="shrink-0" />
      </div>

      {/* Two groups: what the removal targets, then what it costs. A refusal
          renders only the second — the first answers a question the server
          already closed. A long ledger scrolls rather than push the footer off. */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {unledgered ? null : (
          <div className="flex flex-col gap-2">
            {/* Not a second live region: the rows below already announce the
                  outcome this line only counts, and two would talk over each
                  other. */}
            <span id={leadInId} className="font-ui text-desc text-muted">
              {removeLedgerLeadIn(outcome, type)}
            </span>
            <div className="flex flex-col overflow-hidden rounded-item border border-line-row">
              {/* Announced: a row's cost can answer late, and a status
                    nobody hears is seen only by those who can see it. Named
                    apart, or a reader hears three identical regions. */}
              <div role="status" aria-label="Removal targets">
                <ul className="flex flex-col">
                  {detectedRows.map((row) => (
                    <LedgerRow key={row.key} row={row} />
                  ))}
                </ul>
              </div>
              {/* Mounted empty from first render — a live region created
                    with its first message announces unreliably
                    (removal-trace.tsx). Global only, repo reclaims nothing. */}
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
          {/* The refusal for the code the server sent — under a refusal this
                is the panel's whole body, read first and read alone. */}
          <Notice
            id={refusalId}
            trigger="user-action"
            notice={
              preflight.kind === "refused"
                ? { ...preflight.notice, level: "error" }
                : null
            }
          />
          {/* Amber, not danger red: nothing failed and nothing was deleted —
                the price went up, and the rows above already carry it. The
                heading states what happened, never why: only the server knows
                whether the copy changed or nothing was ever agreed (J04). */}
          <Notice
            trigger="user-action"
            notice={
              restated
                ? {
                    ...restated,
                    level: "warning",
                    // The way through sits in the block that restated the
                    // price, so the footer does not offer a second one. Same
                    // verb and object as the sentence's last instruction (F8).
                    action: {
                      label: "Remove skill",
                      onClick: onConfirm,
                      disabled: isRemoving,
                    },
                  }
                : null
            }
          />
          {/* Heading, sentence and detail all come off the code the server
                sent, so the three never disagree about what happened. */}
          <Notice
            trigger="user-action"
            notice={error ? { ...error, level: "error" } : null}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5 border-line-row border-t px-3.5 py-3">
        {/* Beside the control it holds, not in the body: keeps panel height
              steady between "checking" and the answer, so confirm doesn't jump. */}
        {awaitingCheck ? (
          <p
            id={blockedId}
            role="status"
            aria-label="Local edits check"
            className="min-w-0 truncate font-ui text-desc text-dim"
          >
            {CHECKING_TEXT}
          </p>
        ) : null}
        <span className="flex-1" />
        {/* "close" once refused or failed — no pending action left to
              cancel, only a panel to leave. */}
        <Button
          type="button"
          className="shrink-0"
          variant="quiet"
          size="sm"
          disabled={isRemoving}
          onClick={onCancel}
        >
          {failure ? "Close" : "Cancel"}
        </Button>
        {/* Absent, not disabled, once refused: disabled reads as shut for
              now; this is shut for good. Absent too while a restated price is
              on screen — that block carries the same confirm, and two of them
              would ask the same question twice. */}
        {refused || restated !== null ? null : (
          <Button
            type="button"
            className="shrink-0"
            variant="primary"
            size="sm"
            disabled={isRemoving || awaitingCheck}
            aria-describedby={blockedId}
            onClick={onConfirm}
          >
            {/* After a failure the label runs the notice's last instruction,
                  verb for verb: "Confirm the removal again…" (F8). */}
            {isRemoving
              ? "Removing…"
              : failed
                ? "Confirm removal"
                : "Remove skill"}
          </Button>
        )}
      </div>
    </DialogShell>
  );
}
