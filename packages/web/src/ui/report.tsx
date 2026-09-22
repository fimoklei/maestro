import { Button } from "./button";
import { cn } from "./cn";

// What one action did to several primitives, inside the dialog that ran it
// (ADR-0033 §6). Presentational: the caller folds its own result into groups,
// and the worst one is drawn first whatever order it arrives in.

export type ReportTone = "failed" | "attention" | "neutral" | "good";

export type ReportRow = {
  name: string;
  /** Why this row reads the way it does, in one sentence. */
  detail?: string;
  /** How many primitives the row stands for, where one reason hit several. */
  count?: number;
  /** This row's own way out, where the reader has one. */
  action?: { label: string; onClick: () => void };
};

export type ReportGroup = {
  tone: ReportTone;
  /** The group's word, from `CONTEXT.md`. The count is drawn beside it. */
  label: string;
  rows: readonly ReportRow[];
};

// Worst first: the reader meets what needs them before what went well.
const ORDER: ReportTone[] = ["failed", "attention", "neutral", "good"];

// A status reads without colour: the word carries it, the glyph repeats it,
// and the colour is the third channel (ADR-0033 §3). Neutral states nothing.
const GLYPH: Record<ReportTone, string | null> = {
  failed: "✕",
  attention: "⚠",
  neutral: null,
  good: "✓",
};

const INK: Record<ReportTone, string> = {
  failed: "text-red-11",
  attention: "text-amber-11",
  neutral: "text-gray-11",
  good: "text-green-11",
};

export function Report({
  heading,
  groups,
}: {
  heading: string;
  groups: readonly ReportGroup[];
}) {
  const drawn = ORDER.flatMap((tone) =>
    groups.filter((group) => group.tone === tone && group.rows.length > 0),
  );

  return (
    <div className="flex min-w-0 flex-col gap-cell">
      {/* Announced where it stands, so focus is not moved to it. Its own
          region, because a heading may not also be a live region. */}
      <span role="status" className="sr-only">
        {heading}
      </span>
      {/* Under the dialog's own h2 title: a Report never stands alone. */}
      <h3 className="font-ui text-fg text-prose">{heading}</h3>
      {drawn.map((group) => (
        <section key={group.label} className="flex min-w-0 flex-col gap-tight">
          <h4
            className={cn(
              "flex items-center gap-tight font-medium font-ui text-meta",
              INK[group.tone],
            )}
          >
            {GLYPH[group.tone] === null ? null : (
              <span aria-hidden="true" className="font-mono">
                {GLYPH[group.tone]}
              </span>
            )}
            <span>{group.label}</span>
            <span className="tabular-nums">
              {group.rows.reduce((total, row) => total + (row.count ?? 1), 0)}
            </span>
          </h4>
          <ul className="flex min-w-0 flex-col gap-tight">
            {group.rows.map((row) => (
              <li
                key={row.name}
                className="flex min-w-0 items-baseline justify-between gap-inline font-ui text-row"
              >
                <span className="flex min-w-0 flex-wrap items-baseline gap-inline">
                  <span className="font-medium text-fg">{row.name}</span>
                  {row.detail === undefined ? null : (
                    <span className="text-muted">{row.detail}</span>
                  )}
                </span>
                {row.action === undefined ? null : (
                  <Button
                    variant="quiet"
                    size="sm"
                    className="shrink-0"
                    onClick={row.action.onClick}
                  >
                    {row.action.label}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
