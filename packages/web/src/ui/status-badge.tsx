// Adapted from Spectrum UI (Apache-2.0)
import { cn } from "./cn";
import { STATUS_TOKENS } from "./status-family";
import type { StatusReading } from "./status-reading";

export function StatusBadge({ reading }: { reading: StatusReading }) {
  const tokens = STATUS_TOKENS[reading.family];
  return (
    <span
      className={cn(
        "inline-flex h-5 select-none items-center gap-1.5 whitespace-nowrap rounded-chip border px-inline font-medium text-meta",
        tokens.softEdge,
        tokens.fill,
        tokens.ink,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 flex-none rounded-full", tokens.dot)}
      />
      {reading.word}
    </span>
  );
}
