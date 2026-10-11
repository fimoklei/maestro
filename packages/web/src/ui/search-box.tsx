import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";

export type SearchBoxProps = {
  /** The field's name and placeholder, and the icon's name: its action. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** An icon that opens the field over the band, for a narrow band. */
  compact: boolean;
  /** Its place in the row, such as `ml-auto`. */
  className: string;
};

/** A 32px search field, 15rem wide, that gives way down to 12rem before anything else in its row. */
export function SearchBox({
  label,
  value,
  onChange,
  compact,
  className,
}: SearchBoxProps) {
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const shown = !compact || open;

  useEffect(() => {
    if (compact && open) field.current?.focus();
  }, [compact, open]);

  return (
    <div
      className={cn(
        "relative",
        // The vast shrink weight makes the box give way before its neighbours.
        compact ? "flex-none" : "w-60 min-w-48 shrink-[100000]",
        className,
      )}
    >
      {compact ? (
        <IconButton ref={opener} label={label} onClick={() => setOpen(true)}>
          <Icon of={Search} />
        </IconButton>
      ) : null}
      {/* One field in every mode, so focus survives the band narrowing. */}
      <div
        hidden={!shown}
        className={cn(
          compact &&
            "-translate-y-1/2 absolute top-1/2 right-0 z-10 w-48 bg-gray-1",
        )}
      >
        <Icon
          of={Search}
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-inline text-gray-11"
        />
        <input
          ref={field}
          type="search"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (compact && event.key === "Escape") opener.current?.focus();
          }}
          placeholder={label}
          className="h-control w-full rounded-control border border-gray-9 bg-gray-1 pr-inline pl-7 font-ui text-gray-12 text-row placeholder:text-gray-11"
        />
      </div>
    </div>
  );
}
