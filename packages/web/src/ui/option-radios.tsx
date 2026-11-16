import { useId } from "react";

type Option<T extends string> = {
  value: T;
  label: string;
  /** What choosing it does, read out as the radio's description. */
  description: string;
};

// A choice between a few ways to run one action, each a word and a sentence,
// one always selected. RadioGroup is the choice among machine values.
export function OptionRadios<T extends string>({
  legend,
  options,
  value,
  onChange,
  disabled,
}: {
  legend: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-tight border-0 p-0">
      <legend className="p-0 font-ui text-gray-11 text-meta">{legend}</legend>
      {options.map((option) => (
        <div key={option.value} className="flex min-w-0 items-start gap-inline">
          <input
            id={`${id}-${option.value}`}
            type="radio"
            name={id}
            value={option.value}
            checked={value === option.value}
            disabled={disabled}
            aria-describedby={`${id}-${option.value}-description`}
            onChange={() => onChange(option.value)}
            className="mt-1 size-4 shrink-0 cursor-pointer accent-gray-12"
          />
          <span className="flex min-w-0 flex-col">
            <label
              htmlFor={`${id}-${option.value}`}
              className="cursor-pointer text-gray-12 text-row"
            >
              {option.label}
            </label>
            <span
              id={`${id}-${option.value}-description`}
              className="font-ui text-gray-11 text-meta"
            >
              {option.description}
            </span>
          </span>
        </div>
      ))}
    </fieldset>
  );
}
