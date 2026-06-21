import React from "react";

/* Maestro Chip — small mono status/meta capsule. */
export function Chip({ tone = "dim", children, style }) {
  const tones = {
    ok: {
      color: "var(--green-ink)",
      background: "var(--green-bg)",
      border: "1px solid var(--green-border)",
    },
    drift: {
      color: "var(--amber-ink)",
      background: "var(--amber-bg)",
      border: "1px solid var(--amber-border)",
    },
    dim: {
      color: "var(--text-muted)",
      background: "var(--dim-bg)",
      border: "1px solid var(--border-chip)",
    },
  };
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        padding: "2px 7px",
        borderRadius: "var(--radius-control)",
        whiteSpace: "nowrap",
        display: "inline-block",
        ...(tones[tone] || tones.dim),
        ...style,
      }}
    >
      {children}
    </span>
  );
}
