import { useId } from "react";
import { cn } from "../ui/cn";
import { Dialog } from "../ui/dialog";
import { Report, type ReportGroup } from "../ui/report";
import type { BulkRemoveDialogView } from "./bulk-remove-dialog-view";
import type { BulkRemoveReportView } from "./bulk-remove-report-view";

// The bulk remove's confirmation (#422, #423) and the Report that replaces it
// (#424). Presentational — the host owns the checks, the request and the
// in-flight flag.

function CleanLine({ id, children }: { id: string; children: string }) {
  return (
    <p
      id={id}
      className="m-0 flex items-center gap-inline rounded-control border border-edge bg-gray-3 px-cell py-inline font-mono text-meta text-gray-12"
    >
      <span aria-hidden="true" className="text-gray-11">
        ✓
      </span>
      <span>{children}</span>
    </p>
  );
}

// One colour family per tone, read once, so the box and its rows cannot drift.
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

type GroupRow = { label: string; version?: string; reason: string };

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
    <fieldset id={id} className="flex min-w-0 flex-col gap-tight">
      <legend
        className={cn(
          "font-mono font-semibold text-meta tracking-mono-wide",
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
              "flex items-center justify-between gap-inline px-cell py-inline",
              colours.fill,
              index < rows.length - 1 && colours.divider,
            )}
          >
            <span className="flex min-w-0 items-baseline gap-inline">
              <span className="truncate text-gray-12">{row.label}</span>
              {row.version === undefined ? null : (
                <span className="shrink-0 text-gray-11">{row.version}</span>
              )}
            </span>
            <span className={cn("shrink-0", colours.ink)}>{row.reason}</span>
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
  // What the run answered, or null before; the Report replaces the body.
  report: BulkRemoveReportView | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const grouped = view.kind === "grouped" ? view : null;
  const done = report?.kind === "report" ? report : null;
  // The request never produced a report. "never-started" is answered and
  // repeatable; "outcome-unknown" is neither, so it keeps #422's dead end.
  const failure =
    report?.kind === "never-started" || report?.kind === "outcome-unknown"
      ? report
      : null;
  // Absent, not disabled, once the run is over or its outcome is unknown: a
  // control would rerun a removal already made or unseen.
  const confirmOffered = report === null || report.kind === "never-started";

  const dialogId = useId();
  const cleanId = `${dialogId}-clean`;
  const costId = `${dialogId}-cost`;
  const refusedId = `${dialogId}-refused`;

  // The weighing is described; the Report and the failure announce themselves.
  const described =
    grouped === null || done !== null
      ? ""
      : [
          grouped.cleanLine === null ? null : cleanId,
          grouped.cost.length === 0 ? null : costId,
          grouped.refused.length === 0 ? null : refusedId,
        ]
          .filter((id) => id !== null)
          .join(" ");

  return (
    <Dialog
      title={`Remove ${skillName} from ${targetCount} targets`}
      version={null}
      width={640}
      phase={isRemoving ? "running" : confirmOffered ? "idle" : "outcome"}
      action={
        confirmOffered
          ? {
              label:
                grouped?.confirmLabel ?? `Remove from ${targetCount} targets`,
              verb: "remove",
              tone: "danger",
              // Nothing to walk is not a run: a refusal never blocks the
              // others, but with none left the control would remove nothing.
              unavailable:
                grouped === null
                  ? "Checks still running"
                  : grouped.removableCount === 0
                    ? "No target can be removed"
                    : null,
              onRun: onConfirm,
            }
          : null
      }
      failure={
        failure === null
          ? null
          : {
              level: "error",
              label: failure.label,
              message: failure.message,
              detail: failure.detail,
            }
      }
      describedBy={described === "" ? null : described}
      fieldsChanged={false}
      onClose={onCancel}
    >
      {done !== null ? (
        <Report heading={done.heading} groups={reportGroups(done)} />
      ) : failure?.kind === "outcome-unknown" ? null : grouped === null ? (
        <p role="status" className="m-0 text-gray-11">
          {view.kind === "checking" ? view.line : null}
        </p>
      ) : (
        // Stays through the run and beside a failure: it is what the confirm
        // acts on.
        <>
          {grouped.cleanLine === null ? null : (
            <CleanLine id={cleanId}>{grouped.cleanLine}</CleanLine>
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
      )}
    </Dialog>
  );
}

// A refused target was never tried; a failed one was. Both were left alone.
function reportGroups(
  report: Extract<BulkRemoveReportView, { kind: "report" }>,
): ReportGroup[] {
  const leftAlone = (outcome: "failed" | "refused") =>
    report.leftAlone
      .filter((row) => row.outcome === outcome)
      .map((row) => ({ name: row.label, detail: row.reason }));
  return [
    { tone: "failed", label: "Failed", rows: leftAlone("failed") },
    { tone: "failed", label: "Refused", rows: leftAlone("refused") },
    {
      tone: "good",
      label: "Removed",
      rows: report.removed.map((name) => ({ name })),
    },
  ];
}
