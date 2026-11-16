import { useId } from "react";
import type { Copy } from "./phrase";
import { PhraseText } from "./phrase-text";

// One choice outside a list: the box, its label beside it and a hint under
// the label. A list of checkable rows is a `GroupedList` checklist instead.
export function CheckboxField({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  /** What the reader must know before choosing, in one sentence. */
  hint: Copy;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** A write that reads the choice is running. */
  disabled?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex items-start gap-inline">
      {/* A 24px row keeps the 16px box a 24px target. */}
      <span className="flex h-6 shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 shrink-0 cursor-pointer accent-gray-12 disabled:cursor-not-allowed"
        />
      </span>
      <div className="flex min-w-0 flex-col gap-tight">
        <label
          htmlFor={id}
          className="flex h-6 cursor-pointer items-center font-medium font-ui text-gray-12 text-row"
        >
          {label}
        </label>
        <span id={hintId} className="font-ui text-gray-11 text-meta">
          <PhraseText copy={hint} />
        </span>
      </div>
    </div>
  );
}
