import React from "react";

/* Maestro Button — mono-typeset action button. Default size is "md". */
export function Button({
  variant = "primary",
  size = "md",
  children,
  style,
  ...rest
}) {
  const sizes = {
    sm: { fontSize: 10, padding: "3px 8px" },
    md: { fontSize: 11, padding: "6px 12px" },
    lg: { fontSize: 12, padding: "10px 16px" },
  };
  const variants = {
    primary: {
      color: "var(--on-accent)",
      background: "var(--amber)",
      border: "1px solid var(--amber)",
      fontWeight: 700,
    },
    success: {
      color: "var(--on-accent)",
      background: "var(--green)",
      border: "1px solid var(--green)",
      fontWeight: 700,
    },
    ghost: {
      color: "var(--amber-ink)",
      background: "transparent",
      border: "1px solid var(--border-amber-dim)",
      fontWeight: 400,
    },
    quiet: {
      color: "var(--text-muted)",
      background: "transparent",
      border: "1px solid var(--border-chip)",
      fontWeight: 400,
    },
    dashed: {
      color: "var(--text-muted)",
      background: "transparent",
      border: "1px dashed var(--border-dashed)",
      fontWeight: 400,
    },
  };
  return (
    <button
      type="button"
      style={{
        fontFamily: "var(--font-mono)",
        borderRadius:
          size === "lg" ? "var(--radius-item)" : "var(--radius-control)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        ...(sizes[size] || sizes.md),
        ...(variants[variant] || variants.primary),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
