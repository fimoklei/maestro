import { ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import { NO_CATEGORY } from "../ui/category-menu-copy";
import { cn } from "../ui/cn";
import { FieldFrame } from "../ui/field-frame";
import { FOCUS_RING } from "../ui/focus-ring";
import { HOVER_TRANSITION } from "../ui/hover-transition";
import { Icon } from "../ui/icon";
import { CATEGORY_FACT } from "./categories-copy";
import { CategoryPicker } from "./category-picker";

/** What a dialog's Category field shows and reports; `useCategoryChoice` builds it. */
export type CategoryFieldState = {
  /** Null for No category. */
  value: string | null;
  hint: string;
  /** A name the imported file gave that matches no category: the menu opens on Add. */
  suggested: string | null;
  onPick: (category: string | null) => void;
};

/**
 * A dialog's Category field: a button holding the category, which opens the
 * category menu under it. Adding a category there adds it at once.
 */
export function CategoryField({
  field,
  disabled,
}: {
  field: CategoryFieldState;
  /** Locked while the dialog's action runs. */
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const valueId = useId();
  return (
    <FieldFrame
      label={CATEGORY_FACT}
      hint={field.hint}
      error={undefined}
      describedBy={undefined}
      invalid={false}
    >
      {(control) => (
        <div className="flex flex-col gap-tight">
          <button
            ref={button}
            id={control.id}
            type="button"
            aria-labelledby={`${control.labelId} ${valueId}`}
            aria-describedby={control.describedBy}
            aria-expanded={open}
            disabled={disabled}
            onClick={() => setOpen((was) => !was)}
            className={cn(
              "flex h-control w-full cursor-pointer items-center justify-between gap-inline rounded-control border border-gray-9 bg-gray-1 px-inline font-ui text-gray-12 text-row",
              HOVER_TRANSITION,
              FOCUS_RING,
              "hover:bg-gray-3 aria-expanded:bg-gray-3 disabled:cursor-not-allowed disabled:text-gray-11 disabled:hover:bg-gray-1",
            )}
          >
            <span id={valueId} className="truncate">
              {field.value ?? NO_CATEGORY}
            </span>
            <Icon of={ChevronDown} className="shrink-0 text-gray-11" />
          </button>
          {open ? (
            <CategoryPicker
              label={CATEGORY_FACT}
              current={field.value}
              initialQuery={field.suggested ?? undefined}
              onPick={(category) => {
                field.onPick(category);
                setOpen(false);
                button.current?.focus();
              }}
              onClose={(via) => {
                setOpen(false);
                if (via !== "press") button.current?.focus();
              }}
            />
          ) : null}
        </div>
      )}
    </FieldFrame>
  );
}
