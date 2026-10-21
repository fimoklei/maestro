import { type TextareaHTMLAttributes, useId } from "react";
import { cn } from "./cn";

// Field's multi-line twin: the same label, hint and error slots.
export interface TextAreaFieldProps
  extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "value" | "onChange" | "id"
  > {
  /** Visible, always — a placeholder is not a label. */
  label: string;
  /** What the reader must know before acting, in one sentence. */
  hint?: string;
  /** One sentence, shown once the field has been judged. */
  error?: string;
  value: string;
  onChange: (value: string) => void;
}

export function TextAreaField({
  label,
  hint,
  error,
  value,
  onChange,
  className,
  ...rest
}: TextAreaFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint === undefined ? null : hintId, error === undefined ? null : errorId]
      .filter((each) => each !== null)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-tight">
      <label htmlFor={id} className="font-medium font-ui text-gray-12 text-row">
        {label}
      </label>
      {hint === undefined ? null : (
        <span id={hintId} className="font-ui text-meta text-gray-11">
          {hint}
        </span>
      )}
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy}
        className={cn(
          // No outline-none: it hides the one shared focus ring (#227).
          "h-62 min-w-0 resize-none rounded-control border bg-gray-1 px-inline py-tight font-mono text-gray-12 text-row",
          error === undefined ? "border-gray-9" : "border-red-7",
          className,
        )}
        {...rest}
      />
      {error === undefined ? null : (
        <span id={errorId} className="font-ui text-meta text-red-11">
          <span aria-hidden="true">✕ </span>
          {error}
        </span>
      )}
    </div>
  );
}
