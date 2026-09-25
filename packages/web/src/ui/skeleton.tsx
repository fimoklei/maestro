// Adapted from Spectrum UI (Apache-2.0)
import { cn } from "./cn";

// Decorative: the status region already says a read is running.
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        "block h-2 rounded-chip bg-gray-4 motion-safe:animate-pulse motion-safe:[animation-duration:var(--motion-loop)] motion-safe:[animation-timing-function:linear]",
        className,
      )}
    />
  );
}
