import type { ReactNode, Ref } from "react";
import { cn } from "./cn";

// Outlined panel — the basic container of the cockpit. Optional mono header with
// a kind label and a status slot. When its contents drift, the outline warms to
// amber-brown. Borders do all the structural work; there are no shadows.

export interface CardProps {
  /** Header title (mono) — a target name. Omit for a plain container. */
  title?: ReactNode;
  /** Handle on the title heading, for a host that needs to move focus to it. */
  titleRef?: Ref<HTMLHeadingElement>;
  /** Target kind shown before the title: "global" (blue) or "local" (grey). */
  kind?: "global" | "local";
  /** Right-aligned header slot — usually a Chip ("● in sync" / "▲ 2 drift"). */
  status?: ReactNode;
  /** Warm the outline to flag drift inside. */
  drift?: boolean;
  /** Add inner padding around children (rows manage their own padding). */
  padded?: boolean;
  /**
   * Take the height its parent gives it instead of growing with its contents,
   * so a child can own the scrolling. The card and its inner wrapper become a
   * bounded flex column; the caller marks which child scrolls.
   */
  fill?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Card({
  title,
  titleRef,
  kind,
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
        // overflow-clip, not overflow-hidden: both clip children to the rounded
        // corner, but `hidden` also makes the card a scroll container, and a
        // scroll container that never scrolls silently strands any sticky
        // descendant — the inventory's column headers stick to the scrolling
        // region inside the card, so the card must stay out of that chain.
        "overflow-clip rounded-card border bg-card",
        fill && "flex min-h-0 flex-1 flex-col",
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
          {/* A real heading, and focusable by script (tabIndex -1, so it stays
              out of the tab order): when an action inside the card destroys the
              control that triggered it, focus lands here rather than on the
              page body. */}
          <h2
            ref={titleRef}
            tabIndex={-1}
            className="flex-1 truncate font-mono text-data text-fg outline-none"
          >
            {title}
          </h2>
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
