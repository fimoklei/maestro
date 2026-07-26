import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";

// Mono-typeset action button for the cockpit. primary = amber fill (one main
// action per view); success = green fill (confirm deploy); ghost = amber outline
// (row-level "deploy →"); quiet = grey outline; dashed = additive ("+ register").
// Extends the native button so onClick/disabled/type pass straight through.

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "success" | "ghost" | "quiet" | "dashed";
  size?: "sm" | "md" | "lg";
}

// Each variant's hover moves its fill or border one step up its own ramp and
// nothing else (DESIGN.md §5: no scale, no lift, no shadow). `enabled:` keeps a
// disabled button inert.
const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "font-bold text-on-accent bg-amber border-amber enabled:hover:bg-amber-hover enabled:hover:border-amber-hover",
  success:
    "font-bold text-on-accent bg-green border-green enabled:hover:bg-green-hover enabled:hover:border-green-hover",
  ghost:
    "text-amber-ink bg-transparent border-line-amber-dim enabled:hover:bg-amber-bg enabled:hover:border-amber-border",
  quiet:
    "text-muted bg-transparent border-line-chip enabled:hover:bg-inset enabled:hover:border-line-dashed enabled:hover:text-fg-2",
  dashed:
    "text-muted bg-transparent border-dashed border-line-dashed enabled:hover:bg-inset enabled:hover:text-fg-2",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "text-tag px-2 py-[3px]",
  md: "text-chip px-3 py-1.5",
  lg: "text-desc px-4 py-2.5",
};

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "cursor-pointer whitespace-nowrap border font-mono",
        HOVER_TRANSITION,
        // Keyboard focus shows a tokenized amber ring on every variant, which
        // replaces the UA default outline. No transition on the ring, so
        // prefers-reduced-motion is honored by construction (WCAG 2.4.7;
        // issue #227). Do not add outline-none here: it sets --tw-outline-style
        // to none, which focus-visible:outline-2 reads, silently hiding the ring.
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber",
        "disabled:cursor-not-allowed disabled:border-line-chip disabled:bg-dim-bg disabled:text-dim",
        size === "lg" ? "rounded-item" : "rounded-control",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
