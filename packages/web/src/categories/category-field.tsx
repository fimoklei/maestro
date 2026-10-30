import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { NO_CATEGORY } from "../ui/category-menu-copy";
import { cn } from "../ui/cn";
import { HOVER_TRANSITION } from "../ui/hover-transition";
import { Icon } from "../ui/icon";
import { CATEGORY_FIELD } from "./categories-copy";
import { CategoryPicker } from "./category-picker";

// A dialog's Category field: the value on a button that opens the category
// menu below it.
export function CategoryField({
  value,
  onChange,
  disabled,
}: {
  /** Null for No category. */
  value: string | null;
  onChange: (name: string | null) => void;
  disabled: boolean;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const hintId = `${id}-hint`;
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  // The dialog closes on an Escape it sees on the document; the open menu
  // takes it first, on the window, so only the menu closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <div className="relative flex flex-col gap-tight">
      <span id={labelId} className="font-medium font-ui text-gray-12 text-row">
        {CATEGORY_FIELD.label}
      </span>
      <span id={hintId} className="font-ui text-meta text-gray-11">
        {CATEGORY_FIELD.hint}
      </span>
      <button
        ref={button}
        type="button"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-describedby={hintId}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((shown) => !shown)}
        className={cn(
          "flex h-control w-full cursor-pointer items-center justify-between gap-inline rounded-control border border-gray-9 bg-gray-1 px-inline font-ui text-gray-12 text-row",
          HOVER_TRANSITION,
          "hover:bg-gray-3 disabled:cursor-not-allowed disabled:text-gray-11 disabled:hover:bg-gray-1",
        )}
      >
        <span id={valueId} className="truncate">
          {value ?? NO_CATEGORY}
        </span>
        <Icon of={ChevronDown} className="text-gray-11" />
      </button>
      {open ? (
        <div className="absolute top-full right-0 left-0 z-10 mt-tight">
          <CategoryPicker
            label={CATEGORY_FIELD.label}
            current={value}
            onPick={(name) => {
              onChange(name);
              setOpen(false);
              button.current?.focus();
            }}
            onClose={(via) => {
              setOpen(false);
              if (via !== "press") button.current?.focus();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
