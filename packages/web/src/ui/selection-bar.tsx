import { X } from "lucide-react";
import { type ReactNode, useId } from "react";
import { IconButton } from "./icon-button";

export const CLEAR_SELECTION = "Clear selection";
export const selectedCount = (count: number) => `${count} selected`;
export const hiddenByFilterLine = (hidden: number) =>
  `· ${hidden} hidden by the filter`;

export function SelectionBar({
  count,
  hiddenCount = 0,
  onClear,
  children,
}: {
  count: number;
  /** Chosen rows the current search or filter keeps off screen. */
  hiddenCount?: number;
  onClear: () => void;
  /** The actions on the selection. */
  children: ReactNode;
}) {
  const countId = useId();
  return (
    <fieldset
      aria-labelledby={countId}
      className="absolute inset-x-0 bottom-section z-20 mx-auto flex w-fit max-w-[calc(100%-var(--spacing-page))] flex-wrap items-center gap-cell rounded-float border border-gray-7 bg-gray-2 py-tight pr-tight pl-panel font-ui shadow-float"
    >
      <span id={countId} className="text-gray-12 text-row tabular-nums">
        {selectedCount(count)}
      </span>
      {hiddenCount > 0 ? (
        <span className="text-gray-11 text-meta tabular-nums">
          {hiddenByFilterLine(hiddenCount)}
        </span>
      ) : null}
      {children}
      <IconButton label={CLEAR_SELECTION} variant="ghost" onClick={onClear}>
        <X aria-hidden="true" strokeWidth={1.5} className="size-4" />
      </IconButton>
    </fieldset>
  );
}
