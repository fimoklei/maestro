import { X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./icon-button";
import { useDetailPaneFocus } from "./use-detail-pane-focus";

// Where a screen puts its pane (#1065): side by side above 1100px; at 1100px
// and below a full-height sheet over the table's right edge.
export function DetailPaneSlot({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-y-0 right-0 z-20 max-w-full shadow-float min-[1101px]:static min-[1101px]:shadow-none">
      {children}
    </div>
  );
}

// A key typed into one of these belongs to it, not to the pager.
const OWNS_ARROWS = "input,select,textarea,[role=menu],[role=listbox]";

export function DetailPane({
  title,
  activeKey,
  position = null,
  onPage,
  onClose,
  getTriggerElement,
  initialFocus,
  actions,
  children,
}: {
  /** The subject's name; the pane's heading and landmark name. */
  title: string;
  /** Identifies the subject, so focus moves again when the pager moves. */
  activeKey: string;
  /** Where the subject sits in the table; null once the table hides it. */
  position?: { index: number; count: number } | null;
  /** Called with -1 or 1 on the arrow keys, never past either end. */
  onPage?: (step: -1 | 1) => void;
  onClose: () => void;
  // A lookup, not a resolved element: the row behind an open pane can unmount
  // and remount as a new DOM node, so it must be found fresh at close time.
  getTriggerElement: (key: string) => HTMLElement | null;
  /** A selector inside the pane to focus on open; null leaves focus alone. */
  initialFocus?: string | null;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { paneRef, headingRef } = useDetailPaneFocus({
    activeKey,
    getTriggerElement,
    onClose,
    initialFocus,
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (onPage === undefined || position === null) return;
    const step =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : null;
    if (step === null) return;
    if ((event.target as HTMLElement).closest(OWNS_ARROWS)) return;
    const next = position.index + step;
    if (next < 0 || next >= position.count) return;
    event.preventDefault();
    onPage(step);
  };

  return (
    <aside
      ref={paneRef}
      aria-label={`${title} detail`}
      onKeyDown={onKeyDown}
      className="flex h-full w-90 max-w-full flex-none flex-col border-edge border-l bg-gray-1"
    >
      <div className="flex h-12 flex-none items-center gap-inline border-edge border-b px-panel">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="m-0 min-w-0 flex-1 truncate font-semibold text-gray-12 text-heading tracking-heading focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2"
        >
          {title}
        </h2>
        {position === null ? null : (
          <span className="text-gray-11 text-meta tabular-nums">
            <span aria-hidden="true">
              {position.index + 1} / {position.count}
            </span>
            <span className="sr-only">
              {position.index + 1} of {position.count}
            </span>
          </span>
        )}
        <IconButton
          label={`Close ${title} detail`}
          variant="ghost"
          onClick={onClose}
        >
          <X aria-hidden="true" strokeWidth={1.5} className="size-4" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-panel">{children}</div>
      {actions ? (
        <div className="flex flex-none flex-wrap items-start gap-inline border-edge border-t p-panel">
          {actions}
        </div>
      ) : null}
    </aside>
  );
}
