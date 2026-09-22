// Adapted from Spectrum UI (Apache-2.0)
import { cn } from "./cn";
import type { StatusFamily, StatusReading } from "./status-reading";

// Spectrum's status-badge anatomy (fill, 1px border, weight 500, mark plus
// word) at our density: 20px tall, radius 4, colour third (ADR-0033 §3). A
// resting reading carries no fill and no hue (design.md → Meaning and emphasis).
const familyClasses: Record<StatusFamily, { badge: string; glyph: string }> = {
  good: { badge: "border-transparent text-gray-11", glyph: "text-gray-11" },
  neutral: { badge: "border-transparent text-gray-11", glyph: "text-gray-11" },
  unknown: {
    badge: "border-gray-7 bg-gray-3 text-gray-12",
    glyph: "text-gray-11",
  },
  attention: {
    badge: "border-amber-7 bg-amber-3 text-amber-12",
    glyph: "text-amber-11",
  },
  failed: {
    badge: "border-red-7 bg-red-3 text-red-12",
    glyph: "text-red-11",
  },
};

export function StatusBadge({ reading }: { reading: StatusReading }) {
  const classes = familyClasses[reading.family];
  return (
    <span
      className={cn(
        "inline-flex h-5 select-none items-center gap-tight whitespace-nowrap rounded-chip border px-tight font-medium text-meta",
        classes.badge,
      )}
    >
      <span aria-hidden="true" className={classes.glyph}>
        {reading.glyph}
      </span>
      {reading.word}
    </span>
  );
}
