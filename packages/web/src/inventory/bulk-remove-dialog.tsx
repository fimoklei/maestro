import { useId } from "react";
import { useModalDialog } from "../shell/use-modal-dialog";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { panelBorderFor } from "../ui/panel-border";
import { StatusDot } from "../ui/status-dot";
import { TypeTag } from "../ui/type-tag";
import type {
  BulkRemoveCostRow,
  BulkRemoveDialogView,
  BulkRemoveRefusalRow,
} from "./bulk-remove-dialog-view";

// The bulk remove's confirmation (#422), grouped by what it costs (#423). The
// body is the weighing itself: a clean target is a number, a costly one is a
// row with its reason. Presentational — the host owns the checks, the request
// and the in-flight flag; bulkRemoveDialogView owns the grouping.

// One inset line, the shape every non-grouped body takes: the checks, the
// walk, and the clean count all read as one statement about the whole run.
function SummaryRow({
  id,
  tone,
  children,
}: {
  id?: string;
  tone: "clean" | "waiting" | "running";
  children: React.ReactNode;
}) {
  return (
    <p
      id={id}
      className="flex items-center gap-2.5 rounded-item border border-line-row bg-inset px-3 py-2.5 font-mono text-desc text-fg-2"
    >
      {tone === "clean" ? (
        <StatusDot status="ok" />
      ) : (
        // Turning, not still: the run and the checks both take time nobody
        // can shorten, and a static mark would read as a hang.
        <span
          aria-hidden="true"
          className={cn(
            "text-mono-sm",
            tone === "running" ? "text-amber-ink" : "text-dim",
          )}
        >
          ◐
        </span>
      )}
      <span>{children}</span>
    </p>
  );
}

// One colour family per tone, read once — five ternaries on the same flag
// would let the box and its rows drift apart.
const GROUP_TONE = {
  cost: {
    ink: "text-amber-ink",
    border: "border-amber-border",
    fill: "bg-amber-bg",
    divider: "border-amber-border border-b",
  },
  refusal: {
    ink: "text-danger-ink",
    border: "border-danger-border",
    fill: "bg-danger-bg",
    divider: "border-danger-border border-b",
  },
} as const;

// A box of static text with its own accessible name, so the whole cost is read
// out with the question rather than found afterwards.
function ReasonGroup({
  id,
  heading,
  tone,
  rows,
}: {
  id: string;
  heading: string;
  tone: keyof typeof GROUP_TONE;
  rows: (BulkRemoveCostRow | BulkRemoveRefusalRow)[];
}) {
  const colours = GROUP_TONE[tone];
  return (
    // A fieldset for its grouping role, not for a form: the rows are one named
    // block, so a reader hears the count and the reason together.
    <fieldset id={id} className="flex min-w-0 flex-col gap-1.5">
      <legend
        className={cn(
          "font-mono font-semibold text-tag uppercase tracking-[0.12em]",
          colours.ink,
        )}
      >
        {heading}
      </legend>
      <ul
        className={cn(
          "flex flex-col overflow-hidden rounded-item border font-mono text-desc",
          colours.border,
        )}
      >
        {rows.map((row, index) => (
          <li
            key={row.label}
            className={cn(
              "flex items-center justify-between gap-2.5 px-2.5 py-2",
              colours.fill,
              index < rows.length - 1 && colours.divider,
            )}
          >
            <span className="flex min-w-0 items-baseline gap-2.5">
              <span className="truncate text-fg">{row.label}</span>
              {"version" in row ? (
                <span className="shrink-0 text-dim text-mono-sm">
                  {row.version}
                </span>
              ) : null}
            </span>
            <span className={cn("shrink-0 text-mono-sm", colours.ink)}>
              {row.reason}
            </span>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function BulkRemoveDialog({
  skillName,
  targetCount,
  view,
  isRemoving,
  error,
  onCancel,
  onConfirm,
}: {
  skillName: string;
  // Every target the bulk spans, refusals included — the title asks about the
  // whole set, while the confirm names only what it will act on.
  targetCount: number;
  view: BulkRemoveDialogView;
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
  const grouped = view.kind === "grouped" ? view : null;
  const checkingLine = view.kind === "checking" ? view.line : null;
  // Nothing to walk is not a run: a refusal never blocks the others, but with
  // no others left the control would name a removal of nothing.
  const confirmable = grouped !== null && grouped.removableCount > 0;
  // One source for the title: the accessible name and the visible words are
  // the same sentence, so they cannot drift apart.
  const title = isRemoving
    ? { before: "Removing ", after: "" }
    : { before: "Remove ", after: ` from ${targetCount} targets?` };
  const heading = `${title.before}${skillName}${title.after}`;
  // Only skills reach this dialog today, same as the single one.
  const type = "skill" as const;

  const dialogId = useId();
  const cleanId = `${dialogId}-clean`;
  const costId = `${dialogId}-cost`;
  const refusedId = `${dialogId}-refused`;
  const bodyId = `${dialogId}-body`;

  // The whole body, in the order the states outrank each other: a run whose
  // answer was lost, then the run itself, then the checks in front of it, then
  // the weighing. The groups exist only in that last state — during the walk
  // they would price a decision already taken.
  const described =
    error !== null || isRemoving || grouped === null
      ? bodyId
      : [
          grouped.cleanLine === null ? null : cleanId,
          grouped.cost.length === 0 ? null : costId,
          grouped.refused.length === 0 ? null : refusedId,
        ]
          .filter((id) => id !== null)
          .join(" ");

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
        aria-describedby={described === "" ? undefined : described}
        tabIndex={-1}
        className={cn(
          // Capped at the viewport, with only the body scrolling: a bulk can
          // carry a row per target, and a panel that grew past the screen
          // would push its own cancel out of reach.
          "relative flex max-h-[calc(100vh-3rem)] w-full max-w-[460px] flex-col overflow-hidden rounded-card border bg-chrome outline-none",
          panelBorderFor({
            failure: error !== null,
            cost: !isRemoving && (grouped?.cost.length ?? 0) > 0,
          }),
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2.5 border-line-row border-b px-3.5 py-3">
          <h2 className="font-semibold font-ui text-fg text-subtitle">
            {title.before}
            <span className="font-mono">{skillName}</span>
            {title.after}
          </h2>
          <TypeTag type={type} className="shrink-0" />
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
          {error !== null ? (
            <p
              id={bodyId}
              role="alert"
              className="rounded-item border border-danger-border bg-danger-bg px-3 py-2.5 font-ui text-desc text-fg-2"
            >
              {error}
            </p>
          ) : isRemoving ? (
            // The wait explained rather than blank. No per-target progress and
            // no abort: there is no partial-state exit to offer.
            <SummaryRow id={bodyId} tone="running">
              walking {grouped?.removableCount ?? targetCount} targets, one at a
              time
            </SummaryRow>
          ) : grouped === null ? (
            // Announced: the answered count climbs while the panel stands
            // still, and the weighed body replaces it in place.
            <div role="status">
              <SummaryRow id={bodyId} tone="waiting">
                {checkingLine}
              </SummaryRow>
            </div>
          ) : (
            <>
              {grouped.cleanLine === null ? null : (
                <SummaryRow id={cleanId} tone="clean">
                  {grouped.cleanLine}
                </SummaryRow>
              )}
              {grouped.cost.length === 0 ? null : (
                <ReasonGroup
                  id={costId}
                  tone="cost"
                  heading={`▲ LOSES WORK · ${grouped.cost.length}`}
                  rows={grouped.cost}
                />
              )}
              {grouped.refused.length === 0 ? null : (
                <ReasonGroup
                  id={refusedId}
                  tone="refusal"
                  heading={`✕ CAN'T BE REMOVED · ${grouped.refused.length}`}
                  rows={grouped.refused}
                />
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2.5 border-line-row border-t px-3.5 py-3">
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
              disabled={isRemoving || !confirmable}
              onClick={onConfirm}
            >
              {isRemoving
                ? "removing…"
                : (grouped?.confirmLabel ?? `remove from ${targetCount} →`)}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
