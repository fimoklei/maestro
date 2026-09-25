import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";

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
              "cursor-pointer rounded-control border px-3 py-1 font-ui text-meta",
              HOVER_TRANSITION,
              active
                ? "border-gray-7 bg-gray-4 text-gray-12"
                : "border-transparent bg-transparent text-gray-11 hover:bg-gray-3 hover:text-gray-12",
            )}
          >
            {segment.label}
          </button>
        );
      })}
    </fieldset>
  );
}
