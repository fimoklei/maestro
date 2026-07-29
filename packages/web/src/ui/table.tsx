import type { ReactNode } from "react";
import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";

// Owned table primitives (ADR-0004): thin wrappers over native <table>
// elements — accessibility roles come from the browser, not reimplemented.

interface TableSectionProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className }: TableSectionProps) {
  return (
    <table className={cn("w-full border-collapse text-left", className)}>
      {children}
    </table>
  );
}

export function TableHeader({ children, className }: TableSectionProps) {
  return <thead className={className}>{children}</thead>;
}

export function TableBody({ children, className }: TableSectionProps) {
  return <tbody className={className}>{children}</tbody>;
}

// onClick is a mouse convenience (#290) — keep a real focusable control inside
// for the keyboard path. No hover fill here: the caller (inventory-list.tsx)
// knows if the row is already selected and sits higher on the surface ramp.
export function TableRow({
  children,
  className,
  onClick,
}: TableSectionProps & { onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-line-row last:border-b-0",
        onClick && cn("cursor-pointer", HOVER_TRANSITION),
        className,
      )}
    >
      {children}
    </tr>
  );
}

// aria-sort is optional: a sortable header (#287) announces direction; plain
// headers omit it.
export function TableHead({
  children,
  className,
  ariaSort,
}: TableSectionProps & {
  ariaSort?: "ascending" | "descending" | "none";
}) {
  return (
    <th
      aria-sort={ariaSort}
      className={cn(
        "px-card-x py-header-y text-left font-mono text-tag text-muted uppercase tracking-tag",
        className,
      )}
    >
      {children}
    </th>
  );
}

// title carries the full text of a cell that truncates, so the part the column
// clips is still available on hover.
export function TableCell({
  children,
  className,
  colSpan,
  title,
}: TableSectionProps & { colSpan?: number; title?: string }) {
  return (
    <td
      colSpan={colSpan}
      title={title}
      className={cn("px-card-x py-row-y", className)}
    >
      {children}
    </td>
  );
}
