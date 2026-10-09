import type { ReactNode } from "react";
import type { ActionsMenuItem } from "./actions-menu";
import { cn } from "./cn";
import { MachineValue } from "./machine-value";
import { RowMenu } from "./row-menu";
import type { StatusReading } from "./status-reading";
import { Tooltip } from "./tooltip";

// Inside the pane a row carries a mark, never a badge (#1065).
type RowMark = StatusReading & { hint?: string };

export function SubListRow({
  mark,
  name,
  value,
  menuLabel,
  items,
  link = null,
}: {
  /** Null while the reading has not answered: no status before the server. */
  mark: RowMark | null;
  name: string;
  value: ReactNode;
  menuLabel: string;
  items: readonly ActionsMenuItem[];
  /** The row's own page elsewhere, such as a GitHub link cell. */
  link?: ReactNode;
}) {
  return (
    <li className="group/row flex h-row items-center gap-inline border-divider border-b text-row">
      <Mark mark={mark} />
      <span className="min-w-0 flex-1 truncate text-gray-12">{name}</span>
      <span className="text-gray-11">
        <MachineValue>{value}</MachineValue>
      </span>
      {link}
      {items.length === 0 ? null : (
        <RowMenu
          label={menuLabel}
          // In the pane already: no item moves focus into it.
          items={items.map((item) => ({ ...item, movesFocus: false }))}
          tabStop
          busy={false}
        />
      )}
    </li>
  );
}

// A shape, so the reading survives without colour; its word is its name.
function Mark({ mark }: { mark: RowMark | null }) {
  return (
    // 24×24, the pointer floor (WCAG 2.2 SC 2.5.8), inside the 32px row.
    <span className="inline-flex w-6 flex-none justify-center">
      {mark === null ? null : (
        <Tooltip label={mark.word} detail={mark.hint}>
          <span
            role="img"
            aria-label={mark.word}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a tooltip trigger, so its reading opens from the keyboard too (#1068)
            tabIndex={0}
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
        </Tooltip>
      )}
    </span>
  );
}
