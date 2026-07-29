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
import type { RemovePreflightView } from "./remove-preflight-view";

// Silence would read as nothing-to-lose, the one thing an unfinished check
// cannot promise (J04) — it names no cost, so no amber and no ▲ (deployed-view.ts).
const CHECKING_TEXT = "Checking this copy for local edits…";

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

// The outline states the panel's worst news: a failure — refused before apm ran
// or unproven after it — outranks cost outranks an ordinary confirmation.
function panelBorderFor({
  failure,
  cost,
}: {
  failure: boolean;
  cost: boolean;
}): string {
  if (failure) {
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
  // A refusal has no ledger: nothing is going, and leftovers an earlier
  // answer named cannot outlive the answer that named them.
  const rows =
    preflight.kind === "refused"
      ? []
      : removeLedgerRows(target, preflight.reclaim, preflight.check).map(
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
                {/* Announced: a row's cost can answer late, and a status
                    nobody hears is seen only by those who can see it. Named
                    apart, or a reader hears three identical regions. */}
                <div role="status" aria-label="Removed from">
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
            {/* The server's own refusal, in its own words — under a refusal
                this is the panel's whole body, read first and read alone. */}
            {preflight.kind === "refused" ? (
              <FailureNote
                id={refusalId}
                label="can't be removed"
                message={preflight.message}
              />
            ) : null}
            {error ? (
              <FailureNote label="the removal failed" message={error}>
                {/* What the retry beside it will do, replacing a paragraph that
                    sent the user to check the repo by hand (#415). Dim: a
                    property of the control, not a second problem. */}
                <span className="font-ui text-desc text-dim">
                  retry removes only what is left
                </span>
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
            {failure ? "close" : "cancel"}
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
              {isRemoving ? "removing…" : failed ? "retry →" : "remove →"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
