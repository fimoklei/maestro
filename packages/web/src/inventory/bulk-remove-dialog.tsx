import { useId } from "react";
import { useModalDialog } from "../shell/use-modal-dialog";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { TypeTag } from "../ui/type-tag";

// The bulk remove's confirmation (#422). Presentational: the host owns the
// checks, the request and the in-flight flag. Wider than the single dialog so
// a target name and its reason fit on one line. The body is one plain line per
// state — the grouped body (#423) and the report (#424) land on top of this.
// One line, one state, in the order the states outrank each other: a run whose
// answer was lost, then the run itself, then the checks in front of it.
function bodyLine({
  skillName,
  targetCount,
  answeredCount,
  checking,
  isRemoving,
  error,
}: {
  skillName: string;
  targetCount: number;
  answeredCount: number;
  checking: boolean;
  isRemoving: boolean;
  error: string | null;
}): string {
  if (error !== null) {
    return error;
  }
  if (isRemoving) {
    return `walking ${targetCount} targets, one at a time`;
  }
  if (checking) {
    return `checking ${targetCount} targets — ${answeredCount} answered`;
  }
  return `this removes ${skillName} from ${targetCount} targets`;
}

export function BulkRemoveDialog({
  skillName,
  targetCount,
  answeredCount,
  isRemoving,
  error,
  onCancel,
  onConfirm,
}: {
  skillName: string;
  targetCount: number;
  // How many of those targets' checks have answered. Below the count, the
  // confirm is held: confirming against an unknown is the thing this prevents.
  answeredCount: number;
  isRemoving: boolean;
  // The answer was lost, so what the run did is unknown. Stated in one line
  // here; the per-target report is its own ticket (#424).
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Closing is blocked while the run is in flight — walking away mid-run is
  // how a partial state gets made with nobody watching.
  const { panelRef, requestClose } = useModalDialog({
    onClose: onCancel,
    closeEnabled: !isRemoving,
  });
  const checking = answeredCount < targetCount;
  // One source for the title: the accessible name and the visible words are
  // the same sentence, so they cannot drift apart.
  const title = isRemoving
    ? { before: "Removing ", after: "" }
    : { before: "Remove ", after: ` from ${targetCount} targets?` };
  const heading = `${title.before}${skillName}${title.after}`;
  // Only skills reach this dialog today, same as the single one.
  const type = "skill" as const;

  const dialogId = useId();
  const bodyId = `${dialogId}-body`;
  const body = bodyLine({
    skillName,
    targetCount,
    answeredCount,
    checking,
    isRemoving,
    error,
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
        aria-describedby={bodyId}
        tabIndex={-1}
        className="relative flex w-full max-w-[460px] flex-col overflow-hidden rounded-card border border-line bg-chrome outline-none"
      >
        <div className="flex items-center justify-between gap-2.5 border-line-row border-b px-3.5 py-3">
          <h2 className="font-semibold font-ui text-fg text-subtitle">
            {title.before}
            <span className="font-mono">{skillName}</span>
            {title.after}
          </h2>
          <TypeTag type={type} className="shrink-0" />
        </div>

        <div className="px-3.5 py-3">
          {/* Announced: the answered count climbs while the panel stands
              still, and the run's line replaces it in place. */}
          <p
            id={bodyId}
            role={error ? "alert" : "status"}
            className={cn(
              "rounded-item border px-3 py-2.5 font-ui text-desc",
              error
                ? "border-danger-border bg-danger-bg text-fg-2"
                : "border-line-row bg-inset text-muted",
            )}
          >
            {body}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-line-row border-t px-3.5 py-3">
          <Button
            type="button"
            className="shrink-0"
            variant="quiet"
            size="sm"
            disabled={isRemoving}
            onClick={onCancel}
          >
            {error === null ? "cancel" : "close"}
          </Button>
          {/* Absent, not disabled, once the outcome is unknown: the body says
              to go and look, and a confirm beside it would repeat a run
              nobody has seen the result of. Reopening re-checks. */}
          {error === null ? (
            <Button
              type="button"
              className="shrink-0"
              variant="primary"
              size="sm"
              disabled={isRemoving || checking}
              onClick={onConfirm}
            >
              {isRemoving ? "removing…" : `remove from ${targetCount} →`}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
