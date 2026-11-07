import { type RefObject, useId } from "react";
import { MachineValue } from "./machine-value";

// A choice among machine values, such as paths, with a visible label and no
// option selected until the reader picks one.
export function RadioGroup({
  label,
  options,
  value,
  onChange,
  disabled,
  firstRadio,
}: {
  label: string;
  options: readonly string[];
  /** Null until the reader selects an option. */
  value: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
  /** Takes the first option, for a dialog that moves focus to it. */
  firstRadio: RefObject<HTMLInputElement | null> | null;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-labelledby={`${id}-label`}
      className="flex min-w-0 flex-col gap-tight"
    >
      <span id={`${id}-label`} className="font-ui text-gray-11 text-meta">
        {label}
      </span>
      {options.map((option, index) => (
        <label
          key={option}
          className="flex min-h-6 min-w-0 cursor-pointer items-center gap-inline text-gray-12 text-row"
        >
          <input
            ref={index === 0 ? firstRadio : undefined}
            type="radio"
            name={id}
            value={option}
            checked={value === option}
            disabled={disabled}
            onChange={() => onChange(option)}
            className="size-4 shrink-0 cursor-pointer accent-gray-12"
          />
          <span className="min-w-0 wrap-anywhere">
            <MachineValue>{option}</MachineValue>
          </span>
        </label>
      ))}
    </div>
  );
}
