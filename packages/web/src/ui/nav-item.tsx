import type { MouseEventHandler, ReactNode } from "react";
import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";

// One sidebar navigation row, 32px (ADR-0033 §7). The active row is slate 4
// with slate 12 text and aria-current="page" — no left-edge bar, because blue
// is reserved for focus and selection (#991). The icon is decorative.

export interface NavItemProps {
  /** A 16px Lucide icon. */
  icon?: ReactNode;
  /** View name in sentence case, e.g. "Deploy-state". */
  label: ReactNode;
  active?: boolean;
  /** Inert (first-run welcome): visually dimmed and non-interactive. */
  disabled?: boolean;
  /** What waits on this screen (#1115); `unknown` is a read that failed. */
  counter?: { text: string; unknown: boolean } | null;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

export function NavItem({
  icon,
  label,
  active = false,
  disabled = false,
  counter = null,
  onClick,
  className,
}: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-control w-full items-center gap-inline rounded-control px-inline text-left font-ui text-row",
        HOVER_TRANSITION,
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        active
          ? "bg-gray-4 font-medium text-gray-12"
          : "bg-transparent text-gray-11 enabled:hover:bg-gray-3 enabled:hover:text-gray-12",
        className,
      )}
    >
      {icon === undefined ? null : (
        <span aria-hidden="true" className="flex shrink-0 items-center">
          {icon}
        </span>
      )}
      <span className="grow truncate">{label}</span>
      {counter === null ? null : counter.unknown ? (
        <span className="shrink-0 text-gray-11 text-meta">
          <span aria-hidden="true">{counter.text}</span>
          <span className="sr-only">Unknown</span>
        </span>
      ) : (
        <span className="shrink-0 whitespace-nowrap text-amber-11 text-meta">
          {counter.text}
        </span>
      )}
    </button>
  );
}
