import { useId } from "react";
import { cn } from "./cn";

// A label over the value it names, inside the caller's own <dl>. One owner:
// three panels drew the same cell and only one of them wrapped a full hash.
export function Fact({
  label,
  value,
  wrap = false,
  hint,
  title,
}: {
  label: string;
  value: string;
  /** For a value with no break in it — a full commit or tree hash. */
  wrap?: boolean;
  /** What a label cannot say — read as the value's description, not beside it. */
  hint?: string;
  /** The whole value on hover, where the visible one is shortened. */
  title?: string;
}) {
  const hintId = useId();

  return (
    <div className="m-0 flex min-w-0 flex-col">
      <dt className="m-label mb-1.5">{label}</dt>
      <dd
        className={cn(
          "m-0 truncate font-mono text-data text-fg",
          wrap && "break-all",
        )}
        title={title}
        aria-describedby={hint ? hintId : undefined}
      >
        {value}
      </dd>
      {hint ? (
        <p className="m-0 mt-1.5 font-ui text-desc text-muted" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
