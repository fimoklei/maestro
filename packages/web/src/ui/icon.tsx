import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

/** A decorative lucide icon at the standard size and stroke. */
export function Icon({
  of: Glyph,
  small = false,
  className,
}: {
  of: LucideIcon;
  /** 12px, for a mark beside small text. */
  small?: boolean;
  className?: string;
}) {
  return (
    <Glyph
      aria-hidden="true"
      strokeWidth={1.5}
      className={cn(small ? "size-3" : "size-4", className)}
    />
  );
}
