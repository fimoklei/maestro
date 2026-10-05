import { type ReactNode, useId } from "react";
import { Button } from "./button";
import { cn } from "./cn";
import type { NoticeCopy } from "./notice";
import { PhraseText } from "./phrase-text";
import {
  STATUS_TOKENS,
  type StatusFamily,
  WARNING_GLYPH,
} from "./status-family";

// What one action did to several primitives, worst group first.

type ReportTone = Exclude<StatusFamily, "unknown">;

type ReportRow = {
  name: string;
  /** The name is a path, set in mono. */
  mono?: boolean;
  /** Why this row reads the way it does, in one or two short sentences. */
  detail?: ReactNode;
  /** A refusal or failure, stated as the same notice a single action shows. */
  notice?: NoticeCopy;
  /** How many primitives the row stands for, where one reason hit several. */
  count?: number;
  /** This row's own way out, where the reader has one. */
  action?: ReportRowAction;
};

export type ReportRowAction = {
  label: string;
  onClick: () => void;
  /** `busy`: this action runs; `locked`: another one does. */
  status?: "busy" | "locked";
};

export type ReportGroup = {
  tone: ReportTone;
  /** The group's status word. The count is drawn beside it. */
  label: string;
  /** One sentence for the whole group, such as its next step. */
  note?: string;
  rows: readonly ReportRow[];
};

// Worst first: the reader meets what needs them before what went well.
const ORDER: ReportTone[] = ["failed", "attention", "neutral", "good"];

// A group states its status in words; neutral needs no mark beside them.
const GLYPH: Record<ReportTone, string | null> = {
  failed: STATUS_TOKENS.failed.glyph,
  attention: WARNING_GLYPH,
  neutral: null,
  good: STATUS_TOKENS.good.glyph,
};

export function Report({
  heading,
  groups,
}: {
  heading: string;
  groups: readonly ReportGroup[];
}) {
  const id = useId();
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
      <h3 className="font-ui text-gray-12 text-prose">{heading}</h3>
      {drawn.map((group, index) => (
        <section
          key={group.label}
          aria-labelledby={`${id}-${index}`}
          className="flex min-w-0 flex-col gap-tight"
        >
          <h4
            id={`${id}-${index}`}
            className={cn(
              "flex items-center gap-tight font-medium font-ui text-meta",
              STATUS_TOKENS[group.tone].ink,
            )}
          >
            {GLYPH[group.tone] === null ? null : (
              <span
                aria-hidden="true"
                className={cn("font-mono", STATUS_TOKENS[group.tone].mark)}
              >
                {GLYPH[group.tone]}
              </span>
            )}
            <span>{group.label}</span>
            <span className="tabular-nums">
              {group.rows.reduce((total, row) => total + (row.count ?? 1), 0)}
            </span>
          </h4>
          {group.note === undefined ? null : (
            <p className="m-0 font-ui text-gray-11 text-meta">{group.note}</p>
          )}
          <ul
            className={cn(
              "flex min-w-0 flex-col",
              // A notice spans three lines; a wider gap keeps rows apart.
              group.rows.some((row) => row.notice !== undefined)
                ? "gap-cell"
                : "gap-tight",
            )}
          >
            {group.rows.map((row) => (
              <li
                key={row.name}
                className="flex min-w-0 items-baseline justify-between gap-inline font-ui text-row"
              >
                <span className="flex min-w-0 flex-col gap-tight">
                  <span className="flex min-w-0 flex-wrap items-baseline gap-inline">
                    <span
                      className={cn(
                        "font-medium text-gray-12",
                        row.mono ? "break-all font-mono" : null,
                      )}
                    >
                      {row.name}
                    </span>
                    {row.detail === undefined ? null : (
                      <span className="text-gray-11">{row.detail}</span>
                    )}
                    {row.notice === undefined ? null : (
                      <span className="text-gray-12">{row.notice.label}</span>
                    )}
                  </span>
                  {row.notice === undefined ? null : (
                    <span className="text-gray-11">
                      <PhraseText copy={row.notice.message} />
                    </span>
                  )}
                  {row.notice?.detail === undefined ? null : (
                    <span className="text-gray-11">
                      <PhraseText copy={row.notice.detail} />
                    </span>
                  )}
                </span>
                {row.action === undefined ? null : (
                  <Button
                    variant="quiet"
                    size="sm"
                    className="shrink-0"
                    busy={row.action.status === "busy"}
                    aria-disabled={row.action.status !== undefined || undefined}
                    onClick={
                      row.action.status === undefined
                        ? row.action.onClick
                        : undefined
                    }
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
