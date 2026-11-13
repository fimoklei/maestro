import { ChevronDown } from "lucide-react";
import { NO_CATEGORY } from "../ui/category-menu-copy";
import { cn } from "../ui/cn";
import { FOCUS_RING } from "../ui/focus-ring";
import { HOVER_TRANSITION } from "../ui/hover-transition";
import { Icon } from "../ui/icon";
import { setCategoryFor } from "./categories-copy";

/** A checklist row's 24px Category control: it names the row's category and opens its menu. */
export function RowCategoryControl({
  name,
  value,
  open,
  disabled,
  onToggle,
}: {
  /** The row's name, which the control's accessible name carries. */
  name: string;
  /** Null for No category. */
  value: string | null;
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={setCategoryFor(name)}
      aria-expanded={open}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex h-6 max-w-40 cursor-pointer items-center gap-tight rounded-control border border-gray-7 px-tight font-ui text-gray-11 text-meta",
        HOVER_TRANSITION,
        FOCUS_RING,
        "hover:bg-gray-3 aria-expanded:bg-gray-3 disabled:cursor-not-allowed",
      )}
    >
      <span className="truncate">{value ?? NO_CATEGORY}</span>
      <Icon of={ChevronDown} className="shrink-0" />
    </button>
  );
}
