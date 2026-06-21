import React from "react";

/* Maestro NavItem — sidebar navigation item with glyph icon. */
export function NavItem({ icon, label, active = false, onClick, style }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: "var(--radius-item)",
        fontSize: "var(--fs-body)",
        fontFamily: "var(--font-ui)",
        cursor: "pointer",
        background: active ? "var(--surface-active)" : "transparent",
        color: active ? "var(--text-1)" : "var(--text-muted)",
        border: active
          ? "1px solid var(--border-chip)"
          : "1px solid transparent",
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 12,
          width: 14,
          color: active ? "var(--amber-ink)" : "var(--text-dim)",
        }}
      >
        {icon}
      </span>
      {label}
    </div>
  );
}
