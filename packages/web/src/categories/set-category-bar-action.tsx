import type { HarnessPrimitiveType } from "@maestro/core";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import type { MenuClosedBy } from "../ui/category-menu";
import { cn } from "../ui/cn";
import { SET_CATEGORY } from "../ui/control-labels";
import { SetCategoryMenu } from "./set-category-menu";

// The box that would cut the menu off: its nearest scrolling ancestor.
function clippingTop(element: HTMLElement): number {
  for (let at = element.parentElement; at !== null; at = at.parentElement) {
    if (/auto|scroll|hidden/.test(getComputedStyle(at).overflowY)) {
      return at.getBoundingClientRect().top;
    }
  }
  return 0;
}

/** Set category in a selection bar: one category for every selected row. */
export function SetCategoryBarAction({
  type,
  names,
  reread,
}: {
  type: HarnessPrimitiveType;
  names: readonly string[];
  /** The screen's own Re-read control. */
  reread: string;
}) {
  const [open, setOpen] = useState(false);
  // Opens above the bar; below it where the rows above leave too little room.
  const [below, setBelow] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = (via: MenuClosedBy) => {
    setOpen(false);
    setBelow(false);
    if (via !== "press") button.current?.focus();
  };
  useLayoutEffect(() => {
    const element = menu.current;
    if (!open || element === null) return;
    if (element.getBoundingClientRect().top < clippingTop(element)) {
      setBelow(true);
    }
  }, [open]);
  return (
    <div className="relative">
      <Button
        ref={button}
        size="md"
        variant="quiet"
        aria-expanded={open}
        onClick={() => (open ? close("press") : setOpen(true))}
      >
        {SET_CATEGORY}
      </Button>
      {open ? (
        <div
          ref={menu}
          className={cn(
            "absolute left-0 z-30 w-65",
            below ? "top-full mt-cell" : "bottom-full mb-cell",
          )}
        >
          <SetCategoryMenu
            items={names.map((name) => ({ type, name }))}
            reread={reread}
            onClose={close}
          />
        </div>
      ) : null}
    </div>
  );
}
