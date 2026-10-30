import { ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import { MOVE_TO } from "../categories/categories-copy";
import { CategoryPicker } from "../categories/category-picker";
import { NO_CATEGORY } from "../ui/category-menu-copy";
import { cn } from "../ui/cn";
import { FOCUS_RING } from "../ui/focus-ring";
import { HOVER_TRANSITION } from "../ui/hover-transition";
import { Icon } from "../ui/icon";

// Delete category's Move to (#1721): a field that opens the category menu
// under it, without the category being deleted.
export function MoveToField({
  exclude,
  value,
  onChange,
  locked,
}: {
  /** The category being deleted. */
  exclude: string;
  /** Null for No category. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** The delete runs. */
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const valueId = useId();
  const button = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex flex-col gap-tight">
      <span id={labelId} className="font-medium font-ui text-gray-12 text-row">
        {MOVE_TO}
      </span>
      <button
        ref={button}
        type="button"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={locked}
        onClick={() => setOpen((was) => !was)}
        className={cn(
          "inline-flex h-control w-full cursor-pointer items-center justify-between gap-inline rounded-control border border-gray-9 bg-gray-1 px-inline font-ui text-gray-12 text-row",
          HOVER_TRANSITION,
          "hover:bg-gray-3 disabled:cursor-not-allowed disabled:text-gray-11",
          FOCUS_RING,
        )}
      >
        <span id={valueId} className="truncate">
          {value ?? NO_CATEGORY}
        </span>
        <Icon of={ChevronDown} />
      </button>
      {open ? (
        <CategoryPicker
          label={MOVE_TO}
          current={value}
          exclude={exclude}
          onPick={(picked) => {
            onChange(picked);
            setOpen(false);
            button.current?.focus();
          }}
          onClose={(via) => {
            setOpen(false);
            if (via === "escape") button.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
