import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";

// Mono-typeset action button. primary/success/ghost/quiet/dashed variants —
// see variantClasses below for what each means.

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "success" | "ghost" | "quiet" | "dashed";
  size?: "sm" | "md" | "lg";
}

// enabled: keeps a disabled button inert. No scale/lift/shadow (DESIGN.md §5).
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

// sm's 10px type on 3px padding renders 23px tall — a pixel under WCAG 2.2 AA
// 2.5.8's click-target floor. min-h-6 buys that pixel without moving the type
// ramp or the padding rhythm; md and lg clear 24px on their own.
const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "min-h-6 text-tag px-2 py-[3px]",
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
        "cursor-pointer border font-mono",
        // cn concatenates, so two whitespace utilities would leave the base one
        // winning by stylesheet order. A caller that names its own wrapping
        // (Notice's action, whose label is a sentence) takes precedence.
        /\bwhitespace-/.test(className ?? "") ? "" : "whitespace-nowrap",
        HOVER_TRANSITION,
        // Never add outline-none: it sets --tw-outline-style to none, which
        // focus-visible:outline-2 reads, silently hiding the ring (#227).
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
