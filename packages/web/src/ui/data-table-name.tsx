import { useState } from "react";
import { cn } from "./cn";
import { STATUS_TOKENS } from "./status-family";
import type { StatusReading } from "./status-reading";
import { Tooltip } from "./tooltip";

/** A row's name on one line, after a finding's glyph; the tooltip shows it whole once it is shortened. */
export function DataTableName({
  name,
  mark,
}: {
  name: string;
  /** Null: no finding. */
  mark: StatusReading | null;
}) {
  const [shortened, setShortened] = useState(false);
  const text = (
    <span
      // Measured on every render: a new name, or the tooltip's new trigger.
      ref={(element) => {
        if (element === null) return;
        const measure = () =>
          setShortened(element.scrollWidth > element.clientWidth);
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
      }}
      className="block truncate font-medium text-gray-12"
    >
      {name}
    </span>
  );
  const shown = shortened ? <Tooltip label={name}>{text}</Tooltip> : text;
  if (mark === null) return shown;
  return (
    <span className="flex min-w-0 items-center gap-tight">
      <span
        role="img"
        aria-label={mark.word}
        className={cn("flex-none", STATUS_TOKENS[mark.family].mark)}
      >
        {mark.glyph}
      </span>
      {shown}
    </span>
  );
}
