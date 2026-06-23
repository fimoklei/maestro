import type { ReactNode } from "react";
import { cn } from "./cn";

// Section title + mono meta + right-aligned actions slot. Ported from the
// Control Room design system (components/shell/SectionHeader). The title is a
// real heading (h2) so the section stays navigable for screen readers; the meta
// is dim mono context (e.g. "read from lockfiles · 3 targets").
export interface SectionHeaderProps {
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  meta,
  children,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("mb-2.5 flex items-baseline gap-3", className)}>
      <h2 className="m-0 font-semibold font-ui text-fg text-title">{title}</h2>
      {meta ? (
        <span className="font-mono text-dim text-tag">{meta}</span>
      ) : null}
      <div className="flex-1" />
      {children}
    </div>
  );
}
