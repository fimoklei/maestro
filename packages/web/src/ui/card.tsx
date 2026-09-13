import type { ReactNode, Ref } from "react";
import { cn } from "./cn";

// Outlined panel, the cockpit's basic container. No shadows — see DESIGN.md §5.

export interface CardProps {
  /** Header title (mono) — a target name. Omit for a plain container. */
  title?: ReactNode;
  /** Handle on the title heading, for a host that needs to move focus to it. */
  titleRef?: Ref<HTMLHeadingElement>;
  /** Target kind shown before the title: "global" (blue) or "local" (grey). */
  kind?: "global" | "local";
  /** Mono data step between title and status — the target's release. */
  data?: ReactNode;
  /** Right-aligned header slot — usually a Chip ("● in sync" / "▲ 2 drift"). */
  status?: ReactNode;
  /** Warm the outline to flag drift inside. */
  drift?: boolean;
  /** Add inner padding around children (rows manage their own padding). */
  padded?: boolean;
  /** Bounds to the parent's height instead of growing, so a child can scroll. */
  fill?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Card({
  title,
  titleRef,
  kind,
  data,
  status,
  drift = false,
  padded = false,
  fill = false,
  children,
  className,
}: CardProps) {
  return (
    <div
      className={cn(
        // clip, not hidden: hidden makes this a scroll container, which strands
        // sticky descendants (inventory's column headers) in the wrong chain.
        "overflow-clip rounded-card border bg-card",
        fill && "flex min-h-0 flex-1 flex-col",
        drift ? "border-line-drift" : "border-line",
        className,
      )}
    >
      {/* The header wraps rather than overflows: on a narrow card the release
          and the status chip drop to a second line (ADR-0031). */}
      {title ? (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line-row px-card-x py-header-y">
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
          {/* tabIndex -1: out of tab order, but a script can still land focus
              here when an action destroys the control that triggered it. */}
          <h2
            ref={titleRef}
            tabIndex={-1}
            className="min-w-0 flex-1 truncate font-mono text-data text-fg outline-none"
          >
            {title}
          </h2>
          {data ? (
            <span className="ml-auto shrink-0 font-mono text-dim text-tag">
              {data}
            </span>
          ) : null}
          {status}
        </div>
      ) : null}
      <div
        className={cn(
          padded && "p-card-x",
          fill && "flex min-h-0 flex-1 flex-col",
        )}
      >
        {children}
      </div>
    </div>
  );
}
