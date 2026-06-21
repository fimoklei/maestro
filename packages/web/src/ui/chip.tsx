import type { ReactNode } from "react";
import { cn } from "./cn";

// Small mono status / meta capsule. ok = green (in sync), drift = amber
// (attention), dim = grey neutral meta (versions, counts). Prefix status chips
// with a glyph in the content, e.g. "● in sync", "▲ 2 drift".

export interface ChipProps {
  /** "ok" = green, "drift" = amber, "dim" = grey neutral. */
  tone?: "ok" | "drift" | "dim";
  children?: ReactNode;
  className?: string;
}

const toneClasses: Record<NonNullable<ChipProps["tone"]>, string> = {
  ok: "text-green-ink bg-green-bg border-green-border",
  drift: "text-amber-ink bg-amber-bg border-amber-border",
  dim: "text-muted bg-dim-bg border-line-chip",
};

export function Chip({ tone = "dim", children, className }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-control border px-[7px] py-0.5 font-mono text-chip",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
