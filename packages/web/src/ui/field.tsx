import { type InputHTMLAttributes, type ReactNode, useId } from "react";
import { cn } from "./cn";

// One text field: a visible label, a hint between the label and the field, the
// field, and a refusal as one ✕ line under it (ADR-0033 §6). The caller owns
// when the refusal appears — on submit, or right after a folder is picked.

export interface FieldProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
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
  /** A control beside the field, such as **Browse**. */
  trailing?: ReactNode;
  /**
   * Id of a further element that describes the field — a `Notice` in the same
   * slot, where the refusal has a heading and a cause. Merged, never replacing
   * the hint and the error.
   */
  describedBy?: string;
  /** The value is a path, ref or version: set in Geist Mono (ADR-0033 §6). */
  mono?: boolean;
}

export function Field({
  label,
  hint,
  error,
  value,
  onChange,
  trailing,
  describedBy: extraDescribedBy,
  mono = false,
  className,
  ...rest
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [
      hint === undefined ? null : hintId,
      error === undefined ? null : errorId,
      extraDescribedBy ?? null,
    ]
      .filter((each) => each !== null)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-tight">
      <label htmlFor={id} className="font-medium font-ui text-fg text-row">
        {label}
      </label>
      {hint === undefined ? null : (
        <span id={hintId} className="font-ui text-meta text-muted">
          {hint}
        </span>
      )}
      <div className="flex items-center gap-inline">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy}
          className={cn(
            // No outline-none: it poisons --tw-outline-style and hides the one
            // focus ring every control shares (#227).
            "h-control min-w-0 flex-1 rounded-control border bg-canvas px-inline text-fg text-row",
            mono ? "font-mono" : "font-ui",
            error === undefined ? "border-gray-9" : "border-red-7",
            className,
          )}
          {...rest}
        />
        {trailing}
      </div>
      {error === undefined ? null : (
        // One line, glyph and sentence together: the mark carries the severity
        // without colour (WCAG 1.4.1) and is hidden from a reader who hears it.
        <span id={errorId} className="font-ui text-meta text-red-11">
          <span aria-hidden="true">✕ </span>
          {error}
        </span>
      )}
    </div>
  );
}
