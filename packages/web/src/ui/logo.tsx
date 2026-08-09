import type { ReactNode } from "react";

// Brand mark: an amber "M" tile, with an optional "Maestro" wordmark and a dim
// mono context line. Every dimension scales from `size`, so those few values are
// computed inline; colours and fonts come from token utilities.

export interface LogoProps {
  /** Tile size in px. Default 26 (status-bar scale). */
  size?: number;
  wordmark?: boolean;
  /** Dim mono context after the wordmark, e.g. "agent-harness · main · 9 primitives". */
  context?: ReactNode;
  className?: string;
}

export function Logo({
  size = 26,
  wordmark = false,
  context,
  className,
}: LogoProps) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: Math.round(size * 0.55),
      }}
    >
      <div
        className="grid shrink-0 place-items-center bg-amber font-mono font-bold text-on-accent"
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(4, Math.round(size * 0.19)),
          fontSize: Math.round(size * 0.54),
        }}
      >
        M
      </div>
      {wordmark ? (
        <span
          className="font-ui font-semibold text-fg"
          style={{ fontSize: Math.round(size * 0.58), letterSpacing: "0.01em" }}
        >
          Maestro
        </span>
      ) : null}
      {context ? (
        // min-w-0 + overflow-hidden: without them this flex item keeps its
        // content width and a long context overlaps whatever follows it.
        <span className="min-w-0 overflow-hidden font-mono text-chip text-dim">
          {context}
        </span>
      ) : null}
    </div>
  );
}
