import React from "react";

/* Maestro SectionHeader — section title + mono meta + right-aligned actions. */
export function SectionHeader({ title, meta, children, style }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        marginBottom: 10,
        ...style,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "var(--fs-title)",
          fontWeight: 600,
          color: "var(--text-1)",
          fontFamily: "var(--font-ui)",
        }}
      >
        {title}
      </h2>
      {meta ? (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-dim)",
          }}
        >
          {meta}
        </span>
      ) : null}
      <div style={{ flex: 1 }}></div>
      {children}
    </div>
  );
}
