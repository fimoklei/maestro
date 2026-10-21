import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "./cn";
import { FieldFrame } from "./field-frame";
import type { Copy } from "./phrase";

export interface FieldProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
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
  describedBy,
  mono = false,
  invalid = false,
  inputRef,
  className,
  ...rest
}: FieldProps) {
  return (
    <FieldFrame
      label={label}
      hint={hint}
      error={error}
      describedBy={describedBy}
      invalid={invalid}
    >
      {(control) => (
        <div className="flex items-center gap-inline">
          <input
            ref={inputRef}
            id={control.id}
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={control.refused ? true : undefined}
            aria-describedby={control.describedBy}
            className={cn(
              // No outline-none: it poisons --tw-outline-style and hides the one
              // focus ring every control shares (#227).
              "h-control min-w-0 flex-1 rounded-control border bg-gray-1 px-inline text-gray-12 text-row",
              mono ? "font-mono" : "font-ui",
              control.refused ? "border-red-7" : "border-gray-9",
              className,
            )}
            {...rest}
          />
          {trailing}
        </div>
      )}
    </FieldFrame>
  );
}
