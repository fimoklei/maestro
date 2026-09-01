import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";

// A row of buttons holding one choice (e.g. #288's type filter). Presentational
// — caller owns the value. <fieldset>/<legend> name the group for assistive tech.

export interface Segment<V extends string> {
  value: V;
  label: string;
}

export interface SegmentedControlProps<V extends string> {
  /** Accessible name for the group of segments, e.g. "Filter by type". */
  label: string;
  segments: readonly Segment<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
}

export function SegmentedControl<V extends string>({
  label,
  segments,
  value,
  onChange,
  className,
}: SegmentedControlProps<V>) {
  return (
    <fieldset
      className={cn("inline-flex gap-1 rounded-control p-0.5", className)}
    >
      <legend className="sr-only">{label}</legend>
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(segment.value)}
            className={cn(
              "cursor-pointer rounded-control border px-3 py-1 font-mono text-tag tracking-tag",
              HOVER_TRANSITION,
              // Hover stays a step below the active surface (DESIGN.md §5).
              active
                ? "border-line-chip bg-active text-fg"
                : "border-transparent bg-transparent text-muted hover:bg-inset hover:text-fg-2",
            )}
          >
            {segment.label}
          </button>
        );
      })}
    </fieldset>
  );
}
