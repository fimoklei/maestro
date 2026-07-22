import { cn } from "./cn";

// A segmented control: a row of buttons that together hold one choice, like the
// type filter above the inventory table (#288). Presentational — the caller owns
// the selected value and reacts to onChange. A <fieldset> groups the buttons and
// a visually-hidden <legend> names the group for assistive tech; real <button>s
// carry aria-pressed so the active segment is announced.

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
              "cursor-pointer rounded-control border px-3 py-1 font-mono text-tag lowercase tracking-tag",
              active
                ? "border-line-chip bg-active text-fg"
                : "border-transparent bg-transparent text-muted",
            )}
          >
            {segment.label}
          </button>
        );
      })}
    </fieldset>
  );
}
