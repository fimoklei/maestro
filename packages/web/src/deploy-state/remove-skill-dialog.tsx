import { type ReactNode, useId } from "react";
import { useModalDialog } from "../shell/use-modal-dialog";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { TypeTag } from "../ui/type-tag";
import {
  type RemoveDialogTarget,
  type RemoveLedgerRow,
  removeLedgerRows,
} from "./remove-ledger-rows";
import type {
  RemovePreflightView,
  RemoveWarningState,
} from "./remove-preflight-view";

// Amber, never danger red (DESIGN.md — red is for validation errors). "checking"
// still speaks up: silence would read as nothing-to-lose (J04, deployed-view.ts).
const WARNING_TEXT: Record<Exclude<RemoveWarningState, "none">, string> = {
  "local-edits":
    "This copy has local edits. Copy them out first — removing it deletes them with the copy.",
  "cannot-verify":
    "Nothing was recorded to check this copy against, so local edits can't be checked. Removing it may lose work.",
  "check-failed":
    "Maestro couldn't check this copy for local edits. Removing it may lose work.",
  checking: "Checking this copy for local edits…",
};

const GLYPH_BLOCK = "flex gap-1.5";

// One component for both failures — rendered separately, they once diverged
// into a glyphed refusal and a glyph-less error (#387). Danger red, not amber (#213).
function FailureNote({
  id,
  label,
  message,
  children,
}: {
  id?: string;
  label: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <div
      id={id}
      role="alert"
      className={cn(
        GLYPH_BLOCK,
        "rounded-control border border-danger-border bg-danger-bg px-2.5 py-2.5",
      )}
    >
      <span aria-hidden="true" className="font-mono text-danger-ink text-desc">
        ✕
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold font-ui text-danger-ink text-desc">
          {label}
        </span>
        <span className="font-ui text-desc text-fg-2">{message}</span>
        {children}
      </div>
    </div>
  );
}

type LedgerRowPlacement = { id: string; last: boolean };

// The outline states the panel's worst news: refusal outranks cost outranks
// an ordinary confirmation.
function panelBorderFor({
  refused,
  cost,
}: {
  refused: boolean;
  cost: boolean;
}): string {
  if (refused) {
    return "border-danger-border";
  }
  return cost ? "border-line-drift" : "border-line";
}

// apm's uninstall has no -t; faking one orphans the other tools' files
// (apm-behavior.md § Remove, ADR-0013).
function LedgerRow({ row }: { row: RemoveLedgerRow & LedgerRowPlacement }) {
  return (
    <li
      id={row.id}
      className={cn(
        "flex items-baseline gap-1.5 px-3 py-2.5",
        row.last ? null : "border-line-faint border-b",
        row.drift ? "bg-amber-bg" : "bg-inset",
      )}
    >
      {row.drift ? (
        <span aria-hidden="true" className="font-mono text-amber-ink text-desc">
          ▲
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="break-all font-mono text-data text-fg">
          {row.name}
        </span>
        {row.path === null ? null : (
          <span className="break-all font-mono text-fg-2 text-mono-sm">
            {row.path}
          </span>
        )}
      </div>
      {row.status === null ? null : (
        <span className="shrink-0 font-ui text-amber-ink text-mono-sm">
          {row.status}
        </span>
      )}
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
  attempted,
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
  // The server's reason for a refused/failed removal, not the same as a
  // refused `preflight` (which happens before there's anything to confirm).
  error: string | null;
  // Classification owned by removal-attempt.ts — the dialog only renders it.
  attempted: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Closing is blocked while the removal is in flight — the outcome is
  // readable nowhere else.
  const { panelRef, requestClose } = useModalDialog({
    onClose: onCancel,
    closeEnabled: !isRemoving,
  });
  const named = version === null ? skillName : `${skillName} ${version}`;
  const heading = `Remove ${named}?`;
  // Holds the confirm until the check answers — J04 applied to consent, not a
  // second guard on top of #337's decision.
  const awaitingCheck =
    preflight.kind === "warning" && preflight.warning === "checking";
  // A refusal drops both halves of the consent it was asking for: confirm and
  // ledger. What's left is the question and the server's reason (#412).
  const refused = preflight.kind === "refused";
  const reclaim = preflight.kind === "warning" ? preflight.reclaim : [];
  // `checking` is deliberately excluded — it used to wear the same alarm as an
  // answered warning, flashing on and off for every clean-copy removal.
  const costWarning =
    preflight.kind === "warning" &&
    preflight.warning !== "none" &&
    preflight.warning !== "checking"
      ? preflight.warning
      : null;

  const panelBorder = panelBorderFor({
    refused,
    cost: reclaim.length > 0,
  });

  // One id per row, not one wrapping the ledger: a list of references joins
  // with a space by definition; text inside one element doesn't reliably.
  const dialogId = useId();
  const leadInId = `${dialogId}-lead-in`;
  const refusalId = `${dialogId}-refusal`;
  const rows = removeLedgerRows(target, reclaim).map((row, index, all) => ({
    ...row,
    id: `${dialogId}-target-${index}`,
    last: index === all.length - 1,
  }));
  const detectedRows = rows.filter((row) => !row.drift);
  const leftoverRows = rows.filter((row) => row.drift);
  const describedBy = refused
    ? refusalId
    : [leadInId, ...detectedRows.map((row) => row.id)].join(" ");
  // Ties the disabled reason to the control (same wiring as browse dialog's
  // `↑ up`). Only for the running check — a refusal removes the control instead.
  const blockedId = awaitingCheck ? `${dialogId}-blocked` : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-6">
      {/* Real button, hidden from a11y tree and tab order: backdrop dismiss
          without making a static div interactive. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={requestClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn(
          "relative flex w-full max-w-[480px] flex-col overflow-hidden rounded-card border bg-chrome outline-none",
          panelBorder,
        )}
      >
        <div className="flex items-center justify-between gap-2.5 border-line-row border-b px-3.5 py-3">
          <h2 className="font-semibold font-ui text-fg text-subtitle">
            Remove <span className="font-mono">{named}</span>?
          </h2>
          {/* Only skills reach this dialog today — DeployedPrimitive.type is
              the literal "skill" — so the type is stated, not guessed. */}
          <TypeTag type="skill" className="shrink-0" />
        </div>

        {/* Two groups: what the removal targets, then what it costs. A
            refusal renders only the second — the first answers a question
            the server already closed. */}
        <div className="flex flex-col gap-3 px-3.5 py-3">
          {refused ? null : (
            <div className="flex flex-col gap-2">
              <span id={leadInId} className="font-ui text-desc text-muted">
                Primitive will be removed from:
              </span>
              <div className="flex flex-col overflow-hidden rounded-item border border-line-row">
                <ul className="flex flex-col">
                  {detectedRows.map((row) => (
                    <LedgerRow key={row.key} row={row} />
                  ))}
                </ul>
                {/* Mounted empty from first render (removal-trace.tsx). Global
                    only — a repo's targets come from its own apm.yml. */}
                {target.kind === "global" ? (
                  <div role="status" aria-label="Also deleted">
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
            {/* Named: the leftover rows are a status region too, and unnamed a
                reader would hear two identical regions. */}
            {costWarning !== null ? (
              <p
                role="status"
                aria-label="Local-edits check"
                className={cn(
                  GLYPH_BLOCK,
                  "rounded-control border border-amber-border bg-amber-bg px-2.5 py-2.5 font-ui text-amber-ink text-desc",
                )}
              >
                <span aria-hidden="true" className="font-mono">
                  ▲
                </span>
                <span>{WARNING_TEXT[costWarning]}</span>
              </p>
            ) : null}
            {preflight.kind === "refused" ? (
              <FailureNote
                id={refusalId}
                label="can't be removed"
                message={preflight.message}
              />
            ) : null}
            {error ? (
              <FailureNote label="the removal failed" message={error}>
                {/* Neutral, not amber — a second colour here would read as a
                    second, milder problem. */}
                {attempted ? (
                  <span className="font-ui text-desc text-fg-2">
                    The repo may be in a mixed state — some of this skill's
                    files may already be gone. Check it before trying again.
                  </span>
                ) : null}
              </FailureNote>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-line-row border-t px-3.5 py-3">
          {/* Beside the control it holds, not in the body: keeps panel height
              steady between "checking" and the answer, so confirm doesn't jump. */}
          {awaitingCheck ? (
            <p
              id={blockedId}
              role="status"
              aria-label="Local-edits check"
              className="min-w-0 truncate font-ui text-desc text-dim"
            >
              {WARNING_TEXT.checking}
            </p>
          ) : null}
          <span className="flex-1" />
          {/* "close" under a refusal — no pending action left to cancel. */}
          <Button
            type="button"
            className="shrink-0"
            variant="quiet"
            size="sm"
            disabled={isRemoving}
            onClick={onCancel}
          >
            {refused ? "close" : "cancel"}
          </Button>
          {/* Absent, not disabled, once refused: disabled reads as shut for
              now; this is shut for good. */}
          {refused ? null : (
            <Button
              type="button"
              className="shrink-0"
              variant="primary"
              size="sm"
              disabled={isRemoving || awaitingCheck}
              aria-describedby={blockedId}
              onClick={onConfirm}
            >
              {isRemoving ? "removing…" : "remove →"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
