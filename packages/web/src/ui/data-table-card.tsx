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
  body?: readonly (Copy | ReactElement)[];
  /** Label/value facts after the body, laid out as in the detail pane. */
  facts?: readonly DataTableCardFact[];
  /** How fresh the reading is; null: no footer. */
  readAge: string | null;
};

/** A card's fact: its value wraps, since the card is where it shows whole. */
export type DataTableCardFact = { label: string; value: ReactNode };

/** A column's hover card, declared beside its TanStack column definition. */
export type DataTableCardColumn<T> = {
  /** Null: the cell draws no card for this row. */
  content: (row: T, now: Date) => DataTableCardContent | null;
  /** The active row opens the first shown column whose card says so, in column order. */
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
          {content.body?.map((line, index) =>
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
            <FactList size="meta">
              {content.facts.map((fact, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a label repeats, one Branch per pull request, and the order is fixed per card.
                <FactRow key={index} label={fact.label} wrap>
                  {fact.value}
                </FactRow>
              ))}
            </FactList>
          )}
          {content.readAge === null ? null : (
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
