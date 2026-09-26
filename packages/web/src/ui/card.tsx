import type { ReactNode, Ref } from "react";
import { cn } from "./cn";

// Outlined container: slate 1 on a slate 7 border, radius 6, no shadow (#995).

export interface CardProps {
  /** Header title (mono) — a target name. Omit for a plain container. */
  title?: ReactNode;
  /** Handle on the title heading, for a host that needs to move focus to it. */
  titleRef?: Ref<HTMLHeadingElement>;
  /** Target kind shown before the title: "global" (blue) or "local" (grey). */
  kind?: "global" | "local";
  /** Mono data step between title and status — the target's release. */
  data?: ReactNode;
  /** Right-aligned header slot — usually a StatusBadge. */
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
        "overflow-clip rounded-control border bg-gray-1",
        fill && "flex min-h-0 flex-1 flex-col",
        drift ? "border-amber-7" : "border-edge",
        className,
      )}
    >
      {title ? (
        <div className="flex flex-wrap items-center gap-x-inline gap-y-tight border-edge border-b px-panel py-inline">
          {kind ? (
            <span
              className={cn(
                "font-mono text-meta uppercase tracking-mono",
                "text-gray-11",
              )}
            >
              {kind}
            </span>
          ) : null}
          {/* tabIndex -1: a script lands focus here when an action destroys its trigger. */}
          <h2
            ref={titleRef}
            tabIndex={-1}
            className="min-w-0 flex-1 truncate font-mono text-gray-12 text-row outline-none"
          >
            {title}
          </h2>
          {data ? (
            <span className="ml-auto shrink-0 font-mono text-gray-11 text-meta">
              {data}
            </span>
          ) : null}
          {status}
        </div>
      ) : null}
      <div
        className={cn(
          padded && "p-panel",
          fill && "flex min-h-0 flex-1 flex-col",
        )}
      >
        {children}
      </div>
    </div>
  );
}
