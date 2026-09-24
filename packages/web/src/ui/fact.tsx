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
  machine = true,
}: {
  label: string;
  value: string;
  /** For a value with no break in it — a full commit or tree hash. */
  wrap?: boolean;
  /** What a label cannot say — read as the value's description, not beside it. */
  hint?: string;
  /** The whole value on hover, where the visible one is shortened. */
  title?: string;
  /** False for a plain word, which Geist Mono never sets (design.md). */
  machine?: boolean;
}) {
  const hintId = useId();

  return (
    <div className="m-0 flex min-w-0 flex-col">
      <dt className="mb-1.5 font-ui text-gray-11 text-meta">{label}</dt>
      <dd
        className={cn(
          "m-0 truncate text-gray-12 text-row",
          machine ? "font-mono" : "font-ui",
          wrap && "break-all",
        )}
        title={title}
        aria-describedby={hint ? hintId : undefined}
      >
        {value}
      </dd>
      {hint ? (
        <p className="m-0 mt-1.5 font-ui text-meta text-gray-11" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
