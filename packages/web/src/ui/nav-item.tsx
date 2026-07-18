import type { MouseEventHandler, ReactNode } from "react";
import { cn } from "./cn";

// Sidebar navigation item with a unicode glyph icon. Ported from a clickable
// <div> to a real <button> (keyboard + screen-reader reachable); the active view
// is announced with aria-current="page", the icon is decorative (aria-hidden).

export interface NavItemProps {
  /** Unicode glyph, e.g. "▤" inventory, "⇶" deploy-state, "⧉" compose. */
  icon?: ReactNode;
  /** View name in sentence case, e.g. "Deploy-state". */
  label: ReactNode;
  active?: boolean;
  /** Inert (first-run welcome): visually dimmed and non-interactive. */
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

export function NavItem({
  icon,
  label,
  active = false,
  disabled = false,
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
        "flex w-full items-center gap-2.5 rounded-item border px-3 py-2 text-left font-ui text-body",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        active
          ? "border-line-chip bg-active text-fg"
          : "border-transparent bg-transparent text-muted",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "w-3.5 text-[12px]",
          active ? "text-amber-ink" : "text-dim",
        )}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}
