import type { ReactNode } from "react";
import { cn } from "./cn";

// Outlined panel — the basic container of the cockpit. Optional mono header with
// a kind label and a status slot. When its contents drift, the outline warms to
// amber-brown. Borders do all the structural work; there are no shadows.

export interface CardProps {
  /** Header title (mono) — a target name. Omit for a plain container. */
  title?: ReactNode;
  /** Target kind shown before the title: "global" (blue) or "local" (grey). */
  kind?: "global" | "local";
  /** Right-aligned header slot — usually a Chip ("● in sync" / "▲ 2 drift"). */
  status?: ReactNode;
  /** Warm the outline to flag drift inside. */
  drift?: boolean;
  /** Add inner padding around children (rows manage their own padding). */
  padded?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Card({
  title,
  kind,
  status,
  drift = false,
  padded = false,
  children,
  className,
}: CardProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border bg-card",
        drift ? "border-line-drift" : "border-line",
        className,
      )}
    >
      {title ? (
        <div className="flex items-center gap-2.5 border-b border-line-row px-card-x py-header-y">
          {kind ? (
            <span
              className={cn(
                "font-mono text-tag uppercase tracking-[0.1em]",
                kind === "global" ? "text-type-skill" : "text-muted",
              )}
            >
              {kind}
            </span>
          ) : null}
          <span className="flex-1 truncate font-mono text-data text-fg">
            {title}
          </span>
          {status}
        </div>
      ) : null}
      <div className={padded ? "p-card-x" : undefined}>{children}</div>
    </div>
  );
}
