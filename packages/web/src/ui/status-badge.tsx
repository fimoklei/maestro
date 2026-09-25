// Adapted from Spectrum UI (Apache-2.0)
import { cn } from "./cn";
import type { StatusFamily, StatusReading } from "./status-reading";

// Spectrum's data-table badge (soft border, room around the word, one dot) at
// our density: 20px tall, radius 4. The word carries the status (ADR-0033 §3).
const familyClasses: Record<StatusFamily, { badge: string; dot: string }> = {
  good: {
    badge: "border-green-7/50 bg-green-3 text-green-12",
    dot: "bg-green-11",
  },
  neutral: {
    badge: "border-gray-7/50 bg-gray-3 text-gray-11",
    dot: "bg-gray-11",
  },
  unknown: {
    badge: "border-gray-7/50 bg-gray-3 text-gray-11",
    dot: "bg-gray-11",
  },
  attention: {
    badge: "border-amber-7/50 bg-amber-3 text-amber-12",
    dot: "bg-amber-11",
  },
  failed: {
    badge: "border-red-7/50 bg-red-3 text-red-12",
    dot: "bg-red-11",
  },
};

export function StatusBadge({ reading }: { reading: StatusReading }) {
  const classes = familyClasses[reading.family];
  return (
    <span
      className={cn(
        "inline-flex h-5 select-none items-center gap-1.5 whitespace-nowrap rounded-chip border px-inline font-medium text-meta",
        classes.badge,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 flex-none rounded-full", classes.dot)}
      />
      {reading.word}
    </span>
  );
}
