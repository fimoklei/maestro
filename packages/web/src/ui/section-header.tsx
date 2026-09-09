import type { ReactNode } from "react";
import { cn } from "./cn";

// Section title + mono meta + actions slot. Defaults to h2 (a view is a section
// of the app); the connect gate opts into h1 as its own document (ADR-0015).
export interface SectionHeaderProps {
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Heading level for the title. Defaults to 2. */
  level?: 1 | 2 | 3;
  /**
   * Type scale, when the outline and the visual weight disagree — a stage
   * inside a view is an h2 that reads as a subheading. Defaults to `level`.
   */
  size?: 1 | 2 | 3;
}

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
  size = level,
}: SectionHeaderProps) {
  const { tag: Heading } = LEVELS[level];
  const { type } = LEVELS[size];
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
