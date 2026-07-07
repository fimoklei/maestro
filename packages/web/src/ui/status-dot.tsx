import { cn } from "./cn";

// 6px sync-state dot shown next to targets in lists and sidebars. Green = in
// sync, amber = drift, grey = neutral/waiting (setup pending, in-flight).
// Decorative: it always sits beside the same state in text, so it is aria-hidden
// to avoid a redundant screen-reader announcement.

export interface StatusDotProps {
  /**
   * "ok" = green (in sync), "drift" = amber (has drift), "muted" = grey
   * (neutral/waiting — nothing wrong, nothing to sync yet).
   */
  status?: "ok" | "drift" | "muted";
  /** Diameter in px. */
  size?: number;
  className?: string;
}

const statusClasses: Record<NonNullable<StatusDotProps["status"]>, string> = {
  ok: "bg-green-ink",
  drift: "bg-amber-ink",
  muted: "bg-muted",
};

export function StatusDot({
  status = "ok",
  size = 6,
  className,
}: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0", statusClasses[status], className)}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
}
