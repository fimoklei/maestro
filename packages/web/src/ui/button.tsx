import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "success" | "ghost" | "quiet" | "dashed" | "danger";
  /** `sm` is a control inside a row, the rest are the 32px control height. */
  size?: "sm" | "md" | "lg" | "icon";
  /** A write is running: children are its busy label; focus is never lost. */
  busy?: boolean;
}

// The one thing that moves under reduced motion, so no motion-safe guard.
function Spinner() {
  return (
    <svg
      data-spinner=""
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0 animate-spin [animation-duration:var(--motion-spin)] [animation-timing-function:linear]"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="28 10"
      />
    </svg>
  );
}

// enabled: keeps a disabled button inert. `success` shares the primary
// treatment: a green fill would be a second coloured mark.
const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "text-gray-1 bg-gray-12 border-gray-12 enabled:hover:bg-gray-11 enabled:hover:border-gray-11",
  success:
    "text-gray-1 bg-gray-12 border-gray-12 enabled:hover:bg-gray-11 enabled:hover:border-gray-11",
  ghost:
    "text-gray-11 bg-transparent border-transparent enabled:hover:bg-gray-3 enabled:hover:text-gray-12",
  quiet: "text-gray-12 bg-transparent border-edge enabled:hover:bg-gray-3",
  dashed:
    "text-gray-11 bg-transparent border-dashed border-edge enabled:hover:bg-gray-3 enabled:hover:text-gray-12",
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
  busy = false,
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={busy ? undefined : onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-inline rounded-control border font-medium font-ui text-row",
        // cn concatenates, so two whitespace utilities would leave the base one
        // winning by stylesheet order. A caller that names its own wrapping
        // (Notice's action, whose label is a sentence) takes precedence.
        /\bwhitespace-/.test(className ?? "") ? "" : "whitespace-nowrap",
        HOVER_TRANSITION,
        // No outline utility: the ring is one shared :focus-visible rule.
        "disabled:cursor-not-allowed disabled:border-edge disabled:bg-gray-3 disabled:text-gray-11",
        "aria-disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}
