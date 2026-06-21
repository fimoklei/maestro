import React from "react";

/* Maestro StatusDot — 6px sync-state dot used in lists and sidebars. */
export function StatusDot({ status = "ok", size = 6, style }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        flexShrink: 0,
        display: "inline-block",
        background:
          status === "drift" ? "var(--amber-ink)" : "var(--green-ink)",
        ...style,
      }}
    ></span>
  );
}
