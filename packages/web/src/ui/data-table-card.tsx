import type { ReactNode } from "react";
import { HoverCard } from "./hover-card";
import { type Copy, plainText } from "./phrase";
import { PhraseText } from "./phrase-text";
import { StatusBadge } from "./status-badge";
import type { StatusReading } from "./status-reading";

/** What a cell's hover card says; the data table draws it. */
export type DataTableCardContent = {
  reading: StatusReading;
  /** A machine value beside the badge, such as the row's release. */
  value?: ReactNode;
  body: readonly Copy[];
  /** How fresh the reading is; none: no footer. */
  readAge?: string;
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
          <div className="flex items-center gap-inline">
            <StatusBadge reading={content.reading} />
            {content.value}
          </div>
          {content.body.map((line) => (
            <p key={plainText(line)} className="m-0 text-gray-12">
              <PhraseText copy={line} />
            </p>
          ))}
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
