import { useState } from "react";
import type { ActionsMenuItem } from "./actions-menu";
import { cn } from "./cn";
import { DataTableCard } from "./data-table-card";
import { MachineValue } from "./machine-value";
import { type Copy, plainText } from "./phrase";
import { RowMenu } from "./row-menu";
import { Skeleton } from "./skeleton";
import { StatusMark } from "./status-mark";
import type { StatusReading } from "./status-reading";
import { useReadSkeleton } from "./use-read-skeleton";

// Inside the pane a row carries a mark, never a badge (#1065).
type RowMark = StatusReading & { hint?: Copy };

/** A row's value: a version or path is a machine value; words such as a count are not. */
export type SubListValue = { text: string; machine: boolean };

export function SubListRow({
  mark,
  name,
  value,
  menuLabel,
  items,
}: {
  /** Null while the reading has not answered: no status before the server. */
  mark: RowMark | null;
  name: string;
  value: SubListValue;
  menuLabel: string;
  /** A page elsewhere, such as GitHub, is an item here: the row has no link cell. */
  items: readonly ActionsMenuItem[];
}) {
  return (
    <li className="group/row flex h-row items-center gap-inline border-divider border-b text-row">
      <Mark mark={mark} value={value} />
      {/* The name keeps priority: the value gives up its width first. */}
      <span className="min-w-0 truncate text-gray-12">{name}</span>
      <span className="min-w-0 flex-1 truncate text-right text-gray-11">
        {value.machine ? <MachineValue>{value.text}</MachineValue> : value.text}
      </span>
      <RowMenu
        label={menuLabel}
        // In the pane already: no item moves focus into it.
        items={items.map((item) => ({ ...item, movesFocus: false }))}
        tabStop
        busy={false}
      />
    </li>
  );
}

/**
 * A read-only sub-list row: its reading as glyph and visible word, a machine
 * value such as a path, and one meta line under it.
 */
export function SubListValueRow({
  status,
  value,
  meta,
}: {
  /** Null while the reading has not answered: no status before the server. */
  status: StatusReading | null;
  value: string;
  meta: string;
}) {
  return (
    <li className="border-divider border-b pb-tight text-row">
      <span className="flex h-row items-center gap-inline">
        {status === null ? null : (
          <span className="flex-none text-gray-12 text-meta">
            <StatusMark reading={status} />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-gray-12">
          <MachineValue>{value}</MachineValue>
        </span>
      </span>
      {/* Flush with the glyph: the reading's word sets no fixed indent to align under. */}
      <span className="block text-gray-11 text-meta">{meta}</span>
    </li>
  );
}

// Rows still being read, in the row's shape, past 1.3 s.
export function SubListSkeleton({ rows }: { rows: number }) {
  const { visible } = useReadSkeleton(true);
  if (!visible) return null;
  return Array.from({ length: rows }, (_, index) => (
    <li
      // biome-ignore lint/suspicious/noArrayIndexKey: placeholders carry no identity
      key={index}
      aria-hidden="true"
      className="flex h-row items-center gap-inline border-divider border-b"
    >
      <span className="inline-flex w-6 flex-none justify-center">
        <Skeleton className="size-3" />
      </span>
      <Skeleton className="w-28" />
      <Skeleton className="ml-auto w-12" />
      <span className="w-6 flex-none" />
    </li>
  ));
}

// A shape, so the reading survives without colour; its word is its name.
// Its card holds the value whole, which the row may shorten (#1837).
function Mark({ mark, value }: { mark: RowMark | null; value: SubListValue }) {
  const [focused, setFocused] = useState(false);
  return (
    // 24×24, the pointer floor (WCAG 2.2 SC 2.5.8), inside the 32px row.
    <span className="inline-flex w-6 flex-none justify-center">
      {mark === null ? null : (
        <DataTableCard
          content={{
            reading: mark,
            value: value.machine ? (
              <MachineValue>{value.text}</MachineValue>
            ) : (
              value.text
            ),
            body: mark.hint === undefined ? undefined : [mark.hint],
            readAge: null,
          }}
          focused={focused}
          ownsEscape
        >
          <span
            role="img"
            aria-label={mark.word}
            aria-description={
              mark.hint === undefined ? value.text : plainText(mark.hint)
            }
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a hover card trigger, so its reading opens from the keyboard too (#1068)
            tabIndex={0}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2",
              mark.family === "attention"
                ? "text-amber-11"
                : mark.family === "good"
                  ? "text-green-11"
                  : "text-gray-11",
            )}
          >
            {mark.glyph}
          </span>
        </DataTableCard>
      )}
    </span>
  );
}
