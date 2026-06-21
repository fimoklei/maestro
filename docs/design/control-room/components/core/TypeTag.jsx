import React from "react";

/* Maestro TypeTag — uppercase mono tag identifying a primitive's type. */
export function TypeTag({ type = "skill", style }) {
  const colors = {
    skill: "var(--type-skill)",
    hook: "var(--type-hook)",
    mcp: "var(--type-mcp)",
    bundle: "var(--type-bundle)",
  };
  const c = colors[type] || colors.skill;
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "var(--ls-tag)",
        textTransform: "uppercase",
        color: c,
        border: `1px solid color-mix(in srgb, ${c} 27%, transparent)`,
        background: `color-mix(in srgb, ${c} 8%, transparent)`,
        padding: "2px 6px",
        borderRadius: "var(--radius-tag)",
        whiteSpace: "nowrap",
        display: "inline-block",
        ...style,
      }}
    >
      {type}
    </span>
  );
}
