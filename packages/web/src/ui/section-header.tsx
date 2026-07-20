import type { ReactNode } from "react";
import { cn } from "./cn";

// Section title + mono meta + right-aligned actions slot. Ported from the
// Control Room design system (components/shell/SectionHeader). The title is a
// real heading so the section stays navigable for screen readers; the meta is
// dim mono context (e.g. "read from lockfiles · 3 targets"). It defaults to h2
// because a cockpit view is a section of the app; the connect gate opts into h1
// (ADR-0015), being its own document rather than a section of one.
export interface SectionHeaderProps {
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Heading level for the title. Defaults to 2. */
  level?: 1 | 2;
}

export function SectionHeader({
  title,
  meta,
  children,
  className,
  level = 2,
}: SectionHeaderProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className={cn("mb-2.5 flex items-baseline gap-3", className)}>
      <Heading className="m-0 font-semibold font-ui text-fg text-title">
        {title}
      </Heading>
      {meta ? (
        <span className="font-mono text-dim text-tag">{meta}</span>
      ) : null}
      <div className="flex-1" />
      {children}
    </div>
  );
}
