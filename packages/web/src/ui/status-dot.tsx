import { cn } from "./cn";

// Decorative sync-state dot: aria-hidden, since it always sits beside the same
// state in text.

export interface StatusDotProps {
  /** ok = green (in sync), drift = amber, muted = grey (neutral/waiting). */
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
