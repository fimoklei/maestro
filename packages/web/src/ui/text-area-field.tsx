import type { TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { FieldFrame } from "./field-frame";
import type { Copy } from "./phrase";

// Field's multi-line twin: the same label, hint and error slots.
export interface TextAreaFieldProps
  extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "value" | "onChange" | "id"
  > {
  /** Visible, always — a placeholder is not a label. */
  label: string;
  /** What the reader must know before acting, in one sentence. */
  hint?: Copy;
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
  return (
    <FieldFrame
      label={label}
      hint={hint}
      error={error}
      describedBy={undefined}
      invalid={false}
    >
      {(control) => (
        <textarea
          id={control.id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={control.refused ? true : undefined}
          aria-describedby={control.describedBy}
          className={cn(
            // No outline-none: it hides the one shared focus ring (#227).
            "h-62 min-w-0 resize-none rounded-control border bg-gray-1 px-inline py-tight font-mono text-gray-12 text-row",
            control.refused ? "border-red-7" : "border-gray-9",
            className,
          )}
          {...rest}
        />
      )}
    </FieldFrame>
  );
}
