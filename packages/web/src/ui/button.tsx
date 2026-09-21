import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";

// The one action control (ADR-0033). The primary action is neutral, the
// destructive one is outlined red, and no fill carries a status hue.

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "success" | "ghost" | "quiet" | "dashed" | "danger";
  /** `sm` is a control inside a row, the rest are the 32px control height. */
  size?: "sm" | "md" | "lg" | "icon";
}

// enabled: keeps a disabled button inert. `success` shares the primary
// treatment — a green fill would be a second coloured mark (ADR-0033 §2).
const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "text-gray-1 bg-gray-12 border-gray-12 enabled:hover:bg-gray-11 enabled:hover:border-gray-11",
  success:
    "text-gray-1 bg-gray-12 border-gray-12 enabled:hover:bg-gray-11 enabled:hover:border-gray-11",
  ghost:
    "text-gray-11 bg-transparent border-transparent enabled:hover:bg-gray-3 enabled:hover:text-gray-12",
  quiet: "text-gray-12 bg-transparent border-gray-7 enabled:hover:bg-gray-3",
  dashed:
    "text-gray-11 bg-transparent border-dashed border-gray-7 enabled:hover:bg-gray-3 enabled:hover:text-gray-12",
  danger: "text-red-11 bg-transparent border-red-7 enabled:hover:bg-red-3",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-6 px-inline",
  md: "h-control px-cell",
  lg: "h-control px-cell",
  icon: "h-8 w-8 justify-center p-0",
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
        "inline-flex cursor-pointer items-center gap-inline rounded-control border font-medium font-ui text-row",
        // cn concatenates, so two whitespace utilities would leave the base one
        // winning by stylesheet order. A caller that names its own wrapping
        // (Notice's action, whose label is a sentence) takes precedence.
        /\bwhitespace-/.test(className ?? "") ? "" : "whitespace-nowrap",
        HOVER_TRANSITION,
        // No outline utility here: the ring is one :focus-visible rule on blue
        // 9 for every control (theme.css, ADR-0033 §2).
        "disabled:cursor-not-allowed disabled:border-line-chip disabled:bg-dim-bg disabled:text-dim",
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
