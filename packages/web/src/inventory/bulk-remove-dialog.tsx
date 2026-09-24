import { useId } from "react";
import { ACTIONS } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { DIALOG_CANCEL, DialogShell } from "../ui/dialog-shell";
import { Notice } from "../ui/notice";
import { panelBorderFor } from "../ui/panel-border";
import type { BulkRemoveDialogView } from "./bulk-remove-dialog-view";
import type { BulkRemoveReportView } from "./bulk-remove-report-view";
import { TYPE_WORD } from "./type-filter";

// The bulk remove's confirmation (#422), grouped by what it costs (#423), and
// the report that replaces it once the run answers (#424). The body is the
// weighing itself: a clean target is a number, a costly one is a row with its
// reason — and afterwards, a removed target is a number and a left-alone one
// is a row. Presentational — the host owns the checks, the request and the
// in-flight flag; the two view models own the grouping.

// One inset line, the shape every non-grouped body takes: the checks, the
// walk, and the clean count all read as one statement about the whole run.
function SummaryRow({
  id,
  tone,
  children,
}: {
  id?: string;
  tone: "clean" | "done" | "waiting" | "running";
  children: React.ReactNode;
}) {
  return (
    <p
      id={id}
      className="flex items-center gap-2.5 rounded-control border border-gray-7 bg-gray-3 px-3 py-2.5 font-mono text-meta text-gray-12"
    >
      {tone === "clean" || tone === "done" ? (
        // The Good family's mark, uncoloured as it rests: a clean copy before
        // the run, a finished run after it (ADR-0033 §3).
        <span aria-hidden="true" className="text-gray-11 text-meta">
          ✓
        </span>
      ) : (
        // Turning, not still: the run and the checks both take time nobody
        // can shorten, and a static mark would read as a hang.
        <span
          aria-hidden="true"
          className={cn(
            "text-meta",
            tone === "running" ? "text-amber-11" : "text-gray-11",
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
    ink: "text-amber-12",
    border: "border-amber-7",
    fill: "bg-amber-3",
    divider: "border-amber-7 border-b",
  },
  refusal: {
    ink: "text-red-12",
    border: "border-red-7",
    fill: "bg-red-3",
    divider: "border-red-7 border-b",
  },
} as const;

// One row of a group. `reason` is the right-hand slot, `detail` the line under
// it — a report row needs both: the class that left the target alone, and why.
type GroupRow = {
  label: string;
  version?: string;
  reason: string;
  detail?: string;
};

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
  rows: GroupRow[];
}) {
  const colours = GROUP_TONE[tone];
  return (
    // A fieldset for its grouping role, not for a form: the rows are one named
    // block, so a reader hears the count and the reason together.
    <fieldset id={id} className="flex min-w-0 flex-col gap-1.5">
      <legend
        className={cn(
          "font-mono font-semibold text-meta tracking-[0.12em]",
          colours.ink,
        )}
      >
        {heading}
      </legend>
      <ul
        className={cn(
          "flex flex-col overflow-hidden rounded-control border font-mono text-meta",
          colours.border,
        )}
      >
        {rows.map((row, index) => (
          <li
            key={row.label}
            className={cn(
              "flex flex-col gap-1 px-2.5 py-2",
              colours.fill,
              index < rows.length - 1 && colours.divider,
            )}
          >
            <span className="flex items-center justify-between gap-2.5">
              <span className="flex min-w-0 items-baseline gap-2.5">
                <span className="truncate text-gray-12">{row.label}</span>
                {row.version === undefined ? null : (
                  <span className="shrink-0 text-gray-11 text-meta">
                    {row.version}
                  </span>
                )}
              </span>
              <span className={cn("shrink-0 text-meta", colours.ink)}>
                {row.reason}
              </span>
            </span>
            {row.detail === undefined ? null : (
              <span className="text-gray-12 text-meta">{row.detail}</span>
            )}
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
  report,
  onCancel,
  onConfirm,
}: {
  skillName: string;
  // Every target the bulk spans, refusals included — the title asks about the
  // whole set, while the confirm names only what it will act on.
  targetCount: number;
  view: BulkRemoveDialogView;
  isRemoving: boolean;
  // What the run answered, or null while there is nothing to report yet. It
  // replaces the body, the title and the footer — the question is over (#424).
  report: BulkRemoveReportView | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const grouped = view.kind === "grouped" ? view : null;
  const checkingLine = view.kind === "checking" ? view.line : null;
  // Nothing to walk is not a run: a refusal never blocks the others, but with
  // no others left the control would name a removal of nothing.
  const confirmable = grouped !== null && grouped.removableCount > 0;
  // The run is over and its outcome is on screen. Its own title, its own
  // footer, and no weighing left to draw.
  const done =
    report?.kind === "clean" || report?.kind === "partial" ? report : null;
  // The request never produced a report. "never-started" is answered and
  // repeatable; "outcome-unknown" is neither, so it keeps #422's dead end.
  const failure =
    report?.kind === "never-started" || report?.kind === "outcome-unknown"
      ? report
      : null;
  // One source for the title: the accessible name and the visible words are
  // the same sentence, so they cannot drift apart.
  const title =
    done?.title ??
    (isRemoving
      ? { before: "Removing ", after: "" }
      : { before: "Remove ", after: ` from ${targetCount} targets` });
  const heading = `${title.before}${skillName}${title.after}`;
  // "done" only where nothing was left behind: a run that left targets alone
  // is closed, not finished.
  const closeLabel =
    done?.kind === "clean" ? "Done" : report === null ? "Cancel" : "Close";
  // Only skills reach this dialog today, same as the single one.
  const type = "skill" as const;

  const dialogId = useId();
  const cleanId = `${dialogId}-clean`;
  const costId = `${dialogId}-cost`;
  const refusedId = `${dialogId}-refused`;
  const bodyId = `${dialogId}-body`;
  const countsId = `${dialogId}-counts`;
  const leftAloneId = `${dialogId}-left-alone`;

  // The whole body, in the order the states outrank each other: the run's own
  // report, then a request that produced none, then the run itself, then the
  // checks in front of it, then the weighing. The groups exist only in that
  // last state — during the walk they would price a decision already taken.
  const described =
    done !== null
      ? [countsId, done.kind === "partial" ? leftAloneId : null]
          .filter((id) => id !== null)
          .join(" ")
      : failure !== null || isRemoving || grouped === null
        ? bodyId
        : [
            grouped.cleanLine === null ? null : cleanId,
            grouped.cost.length === 0 ? null : costId,
            grouped.refused.length === 0 ? null : refusedId,
          ]
            .filter((id) => id !== null)
            .join(" ");

  // The weighing itself, drawn once: it is the confirmation's body, and it
  // comes back beside a request that never started.
  const weighing =
    grouped === null ? null : (
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
            heading={`▲ Loses work · ${grouped.cost.length}`}
            rows={grouped.cost}
          />
        )}
        {grouped.refused.length === 0 ? null : (
          <ReasonGroup
            id={refusedId}
            tone="refusal"
            heading={`✕ Cannot be removed · ${grouped.refused.length}`}
            rows={grouped.refused}
          />
        )}
      </>
    );

  return (
    // Closing is blocked while the run is in flight — walking away mid-run is
    // how a partial state gets made with nobody watching.
    <DialogShell
      label={heading}
      describedBy={described === "" ? null : described}
      width={480}
      border={panelBorderFor({
        failure: failure !== null || done?.kind === "partial",
        cost: done === null && !isRemoving && (grouped?.cost.length ?? 0) > 0,
      })}
      destructive
      onClose={onCancel}
      closeEnabled={!isRemoving}
    >
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-gray-7 border-b px-3.5 py-3">
        <h2 className="font-semibold font-ui text-gray-12 text-prose">
          {title.before}
          <span className="font-mono">{skillName}</span>
          {title.after}
        </h2>
        <span className="shrink-0 text-gray-11 text-meta">
          {TYPE_WORD[type]}
        </span>
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {/* Mounted empty from first render — a live region created with its
              first message announces unreliably (remove-skill-dialog.tsx). The
              report itself is ordinary content, read where it is. */}
        <span
          role="status"
          aria-live="polite"
          aria-label="Bulk removal result"
          className="sr-only"
        >
          {done === null ? "" : `${heading} · ${done.counts}`}
        </span>
        {done !== null ? (
          <>
            <SummaryRow id={countsId} tone="done">
              {done.counts}
            </SummaryRow>
            {done.kind === "partial" ? (
              <ReasonGroup
                id={leftAloneId}
                tone="refusal"
                heading={`✕ Left alone · ${done.leftAlone.length}`}
                // The class in the right-hand slot, the reason under it: one
                // without the other says nothing to act on.
                rows={done.leftAlone.map((row) => ({
                  label: row.label,
                  reason: row.outcome,
                  detail: row.reason,
                }))}
              />
            ) : null}
          </>
        ) : failure !== null ? (
          <>
            <Notice
              id={bodyId}
              trigger="user-action"
              notice={{
                level: "error",
                label: failure.label,
                message: failure.message,
                detail: failure.detail,
              }}
            />
            {/* Only where the attempt can be repeated: the body the confirm
                  beside it would act on comes back with it. */}
            {failure.kind === "never-started" ? weighing : null}
          </>
        ) : isRemoving ? (
          // The wait explained rather than blank. No per-target progress and
          // no abort: there is no partial-state exit to offer.
          <SummaryRow id={bodyId} tone="running">
            Removing from {grouped?.removableCount ?? targetCount} targets, one
            at a time
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
          weighing
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2.5 border-gray-7 border-t px-3.5 py-3">
        <Button
          type="button"
          className="shrink-0"
          // Success only where the run finished clean: it is then the one
          // control on the panel, and a quiet button would read as a dismiss.
          variant={done?.kind === "clean" ? "success" : "quiet"}
          size="sm"
          disabled={isRemoving}
          {...DIALOG_CANCEL}
          onClick={onCancel}
        >
          {closeLabel}
        </Button>
        {/* Absent, not disabled, once the run is over or its outcome is
              unknown: there is nothing left to confirm, and a control beside
              either would rerun a removal already made or unseen. */}
        {report === null || report.kind === "never-started" ? (
          <Button
            type="button"
            className="shrink-0"
            variant="primary"
            size="sm"
            busy={isRemoving}
            disabled={!confirmable}
            onClick={onConfirm}
          >
            {isRemoving
              ? ACTIONS.remove.busy
              : (grouped?.confirmLabel ?? `Remove from ${targetCount} targets`)}
          </Button>
        ) : null}
      </div>
    </DialogShell>
  );
}
