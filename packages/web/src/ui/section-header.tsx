import type { ReactNode } from "react";
import { cn } from "./cn";

// Section title + mono meta + right-aligned actions slot. Ported from the
// Control Room design system (components/shell/SectionHeader). The title is a
// real heading so the section stays navigable for screen readers; the meta is
// dim mono context (e.g. "read from lockfiles · 3 targets"). It defaults to h2
// because a cockpit view is a section of the app; the connect gate opts into h1
// (ADR-0015), being its own document rather than a section of one. Level 3 is a
// heading inside a view: it drops to the Subtitle step, which DESIGN.md reserves
// for secondary headings, so rank and weight say the same thing instead of
// leaving every heading on a view looking equal.
export interface SectionHeaderProps {
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Heading level for the title. Defaults to 2. */
  level?: 1 | 2 | 3;
}

// Tag and weight are one decision per level, so a new level cannot be added to
// half the component.
const LEVELS = {
  1: { tag: "h1", type: "font-semibold text-title" },
  2: { tag: "h2", type: "font-semibold text-title" },
  3: { tag: "h3", type: "font-medium text-subtitle" },
} as const;

export function SectionHeader({
  title,
  meta,
  children,
  className,
  level = 2,
}: SectionHeaderProps) {
  const { tag: Heading, type } = LEVELS[level];
  return (
    <div className={cn("mb-2.5 flex items-baseline gap-3", className)}>
      <Heading className={cn("m-0 font-ui text-fg", type)}>{title}</Heading>
      {meta ? (
        <span className="font-mono text-dim text-tag">{meta}</span>
      ) : null}
      <div className="flex-1" />
      {children}
    </div>
  );
}
