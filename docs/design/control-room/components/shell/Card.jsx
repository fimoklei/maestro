import React from "react";

/* Maestro Card — outlined panel; optional mono header with kind label + status. */
export function Card({
  title,
  kind,
  status,
  drift = false,
  padded = false,
  children,
  style,
}) {
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: `1px solid ${drift ? "var(--border-drift)" : "var(--border-strong)"}`,
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        ...style,
      }}
    >
      {title ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "var(--pad-header-y) var(--pad-card-x)",
            borderBottom: "1px solid var(--border-row)",
          }}
        >
          {kind ? (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color:
                  kind === "global" ? "var(--type-skill)" : "var(--text-muted)",
              }}
            >
              {kind}
            </span>
          ) : null}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              color: "var(--text-1)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </span>
          {status}
        </div>
      ) : null}
      <div style={padded ? { padding: "var(--pad-card-x)" } : null}>
        {children}
      </div>
    </div>
  );
}
