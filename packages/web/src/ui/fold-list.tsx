import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "./cn";
import { FOCUS_RING } from "./focus-ring";
import { Icon } from "./icon";
import { MachineValue } from "./machine-value";
import { STATUS_TOKENS, type StatusFamily } from "./status-family";

// A Report's read-only list of places, one fact each. A line with details
// folds, open by default, to label | value rows and its next step.

export type FoldLine = {
  key: string;
  /** A path or another machine value, set in mono. */
  name: string;
  tone: StatusFamily;
  fact: string;
  /** A line the action left alone, such as a folder it does not write. */
  muted?: boolean;
  /** Label | value rows; a line with none does not fold. */
  details: readonly { label: string; value: string }[];
  /** The next step, under the details. */
  step: string | null;
};

export function FoldList({
  legend,
  lines,
}: {
  legend: string;
  lines: readonly FoldLine[];
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-tight border-0 p-0">
      <legend className="p-0 font-ui text-gray-11 text-meta">{legend}</legend>
      <ul className="m-0 flex list-none flex-col overflow-hidden rounded-control border border-edge p-0">
        {lines.map((line, index) => (
          <Line key={line.key} line={line} last={index === lines.length - 1} />
        ))}
      </ul>
    </fieldset>
  );
}

function Line({ line, last }: { line: FoldLine; last: boolean }) {
  const [open, setOpen] = useState(true);
  const detailsId = useId();
  const folds = line.details.length > 0;
  const head = (
    <>
      <span
        aria-hidden="true"
        className={cn("w-4 font-mono text-meta", STATUS_TOKENS[line.tone].mark)}
      >
        {STATUS_TOKENS[line.tone].glyph}
      </span>
      <span
        className={cn(
          "flex min-w-0 items-center gap-tight text-row",
          line.muted ? "text-gray-11" : "text-gray-12",
        )}
      >
        {folds ? <Icon of={open ? ChevronDown : ChevronRight} /> : null}
        {/* A path has no break point of its own; it wraps, never clips. */}
        <span className="min-w-0 wrap-anywhere">
          <MachineValue>{line.name}</MachineValue>
        </span>
      </span>
      <span className="text-right text-gray-11 text-meta">{line.fact}</span>
    </>
  );
  const grid =
    "grid min-h-row w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-inline px-cell py-tight font-ui";
  return (
    <li className={cn("flex flex-col", !last && "border-edge border-b")}>
      {folds ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen(!open)}
          className={cn(
            grid,
            "cursor-pointer text-left hover:bg-gray-4",
            FOCUS_RING,
          )}
        >
          {head}
        </button>
      ) : (
        <div className={grid}>{head}</div>
      )}
      {folds ? (
        <div
          id={detailsId}
          hidden={!open}
          className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-inline gap-y-tight pr-cell pb-tight pl-10 font-ui text-row"
        >
          {line.details.map((detail) => (
            <div key={`${detail.label}\0${detail.value}`} className="contents">
              <span className={STATUS_TOKENS[line.tone].ink}>
                {detail.label}
              </span>
              <span className="min-w-0 break-words text-gray-12">
                {detail.value}
              </span>
            </div>
          ))}
          {line.step === null ? null : (
            <p className="col-start-2 m-0 text-gray-11 text-meta">
              {line.step}
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}
