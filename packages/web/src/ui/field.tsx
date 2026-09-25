import {
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  useId,
} from "react";
import { cn } from "./cn";

// The caller owns when the refusal appears: on submit, or right after a pick.

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
  /** A further describing element, such as a `Notice`; merged with hint and error. */
  describedBy?: string;
  /** The value is a path, ref or version: set in Geist Mono. */
  mono?: boolean;
  /** Refused by a `Notice` in the slot rather than by `error`. */
  invalid?: boolean;
  /** For a host that hands focus back to the field after a refusal. */
  inputRef?: Ref<HTMLInputElement>;
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
  invalid = false,
  inputRef,
  className,
  ...rest
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const refused = invalid || error !== undefined;
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
      <label htmlFor={id} className="font-medium font-ui text-gray-12 text-row">
        {label}
      </label>
      {hint === undefined ? null : (
        <span id={hintId} className="font-ui text-meta text-gray-11">
          {hint}
        </span>
      )}
      <div className="flex items-center gap-inline">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={refused ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            // No outline-none: it poisons --tw-outline-style and hides the one
            // focus ring every control shares (#227).
            "h-control min-w-0 flex-1 rounded-control border bg-gray-1 px-inline text-gray-12 text-row",
            mono ? "font-mono" : "font-ui",
            refused ? "border-red-7" : "border-gray-9",
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
