import type { CategoryList, HarnessPrimitiveType } from "@maestro/core";
import { useRef, useState } from "react";
import type { MenuClosedBy } from "../ui/category-menu";
import type { FootItem } from "../ui/foot-actions";
import { SetCategoryMenu } from "./set-category-menu";

/**
 * Set category on a table screen's rows: the category of each row, the pane
 * foot's item, and the menu it opens above the foot rather than as a dialog.
 */
export function usePaneCategory({
  type,
  assignments,
  reread,
}: {
  type: HarnessPrimitiveType;
  /** Undefined while unread, which leaves Set category out. */
  assignments: CategoryList["assignments"] | undefined;
  /** The screen's own Re-read control, which a refusal names. */
  reread: string;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = (via: MenuClosedBy) => {
    setOpen(false);
    if (via !== "press") button.current?.focus();
  };
  return {
    /** Set category is offered once the categories are read. */
    offered: assignments !== undefined,
    open,
    /** Opens or closes the menu: a stable setter, safe in built-once columns. */
    setOpen,
    /** A row's category: null for none, undefined while unread. */
    categoryOf: (name: string): string | null | undefined =>
      assignments === undefined
        ? undefined
        : (assignments.find((each) => each.type === type && each.name === name)
            ?.category ?? null),
    footItem: (label: string): FootItem => ({
      label,
      expanded: open,
      buttonRef: button,
      onSelect: () => setOpen(!open),
    }),
    footMenu: (name: string) =>
      open ? (
        <SetCategoryMenu
          // Keyed by row: paging to the next row starts afresh.
          key={name}
          items={[{ type, name }]}
          reread={reread}
          onClose={close}
        />
      ) : null,
  };
}
