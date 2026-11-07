import { cn } from "./cn";
import { STATUS_TOKENS } from "./status-family";
import type { StatusReading } from "./status-reading";

/** A reading as one mark and its word, without a badge: a part of a row, such as a Global folder. */
export function StatusMark({ reading }: { reading: StatusReading }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-tight">
      <span
        aria-hidden="true"
        className={cn("flex-none", STATUS_TOKENS[reading.family].mark)}
      >
        {reading.glyph}
      </span>
      <span className="truncate">{reading.word}</span>
    </span>
  );
}
