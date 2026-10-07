import { isValidElement, type ReactElement, type ReactNode } from "react";
import { FactList, FactRow } from "./fact-list";
import { HoverCard } from "./hover-card";
import { type Copy, plainText } from "./phrase";
import { PhraseText } from "./phrase-text";
import { StatusBadge } from "./status-badge";
import type { StatusReading } from "./status-reading";

/** What a cell's hover card says; the data table draws it. */
export type DataTableCardContent = {
  /** None: no badge; with no value either, no header. */
  reading?: StatusReading;
  /** A machine value beside the badge, such as the row's release. */
  value?: ReactNode;
  /** Sentences, or an element for a body that is not one, such as a list. */
  body: readonly (Copy | ReactElement)[];
  /** Label/value facts after the body, laid out as in the detail pane. */
  facts?: readonly DataTableCardFact[];
  /** How fresh the reading is; none: no footer. */
  readAge?: string;
};

export type DataTableCardFact = {
  label: string;
  value: ReactNode;
  /** A value that is the fact itself, such as a branch: it wraps. */
  wrap?: boolean;
};

/** A column's hover card, declared beside its TanStack column definition. */
export type DataTableCardColumn<T> = {
  /** Null: the cell draws no card for this row. */
  content: (row: T, now: Date) => DataTableCardContent | null;
  /** The active row opens the first shown column whose card says so. */
  keyboard: boolean;
};

export function DataTableCard({
  content,
  focused,
  children,
}: {
  content: DataTableCardContent;
  focused: boolean;
  children: ReactNode;
}) {
  return (
    <HoverCard
      focused={focused}
      content={
        <div className="flex flex-col gap-inline">
          {content.reading === undefined &&
          content.value === undefined ? null : (
            <div className="flex items-center gap-inline">
              {content.reading === undefined ? null : (
                <StatusBadge reading={content.reading} />
              )}
              {content.value}
            </div>
          )}
          {content.body.map((line, index) =>
            isValidElement(line) ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: the body's order is fixed per card.
              <div key={index}>{line}</div>
            ) : (
              <p key={plainText(line)} className="m-0 text-gray-12">
                <PhraseText copy={line} />
              </p>
            ),
          )}
          {content.facts === undefined ? null : (
            <FactList>
              {content.facts.map((fact) => (
                <FactRow key={fact.label} label={fact.label} wrap={fact.wrap}>
                  {fact.value}
                </FactRow>
              ))}
            </FactList>
          )}
          {content.readAge === undefined ? null : (
            <p className="m-0 border-divider border-t pt-inline text-gray-11">
              {content.readAge}
            </p>
          )}
        </div>
      }
    >
      <span className="inline-flex align-middle">{children}</span>
    </HoverCard>
  );
}
