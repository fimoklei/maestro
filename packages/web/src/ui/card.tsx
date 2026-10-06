import type { ReactNode } from "react";
import { cn } from "./cn";

// Outlined container: slate 1 on a slate 7 border, radius 6, no shadow (#995).

export interface CardProps {
  /** Warm the outline to flag drift inside. */
  drift?: boolean;
  /** Add inner padding around children (rows manage their own padding). */
  padded?: boolean;
  /** Bounds to the parent's height instead of growing, so a child can scroll. */
  fill?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Card({
  drift = false,
  padded = false,
  fill = false,
  children,
  className,
}: CardProps) {
  return (
    <div
      className={cn(
        // clip, not hidden: hidden makes this a scroll container, which strands
        // sticky descendants (inventory's column headers) in the wrong chain.
        "overflow-clip rounded-control border bg-gray-1",
        fill && "flex min-h-0 flex-1 flex-col",
        drift ? "border-amber-7" : "border-edge",
        padded && "p-panel",
        className,
      )}
    >
      {children}
    </div>
  );
}
