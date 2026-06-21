import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

// Mono-typeset action button for the cockpit. primary = amber fill (one main
// action per view); success = green fill (confirm deploy); ghost = amber outline
// (row-level "deploy →"); quiet = grey outline; dashed = additive ("+ register").
// Extends the native button so onClick/disabled/type pass straight through.

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "success" | "ghost" | "quiet" | "dashed";
  size?: "sm" | "md" | "lg";
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "font-bold text-on-accent bg-amber border-amber",
  success: "font-bold text-on-accent bg-green border-green",
  ghost: "text-amber-ink bg-transparent border-line-amber-dim",
  quiet: "text-muted bg-transparent border-line-chip",
  dashed: "text-muted bg-transparent border-dashed border-line-dashed",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "text-tag px-2 py-[3px]",
  md: "text-chip px-3 py-1.5",
  lg: "text-[12px] px-4 py-2.5",
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
        "cursor-pointer whitespace-nowrap border font-mono disabled:cursor-not-allowed",
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
