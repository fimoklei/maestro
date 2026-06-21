import React from "react";

/* Maestro Logo — amber "M" tile, optional wordmark + mono context line. */
export function Logo({ size = 26, wordmark = false, context, style }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: Math.round(size * 0.55),
        ...style,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(4, Math.round(size * 0.19)),
          background: "var(--amber)",
          color: "var(--on-accent)",
          display: "grid",
          placeItems: "center",
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          fontSize: Math.round(size * 0.54),
          flexShrink: 0,
        }}
      >
        M
      </div>
      {wordmark ? (
        <span
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: Math.round(size * 0.58),
            fontWeight: 600,
            letterSpacing: "0.01em",
            color: "var(--text-1)",
          }}
        >
          Maestro
        </span>
      ) : null}
      {context ? (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-dim)",
          }}
        >
          {context}
        </span>
      ) : null}
    </div>
  );
}
