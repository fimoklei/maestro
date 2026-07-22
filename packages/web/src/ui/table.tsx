import type { ReactNode } from "react";
import { cn } from "./cn";

// Owned table primitives (shadcn-style, restyled to tokens per ADR-0004): thin
// wrappers over the native table elements so callers compose real <table>
// markup — accessibility (row/columnheader/cell roles) comes from the browser,
// not from us reimplementing it.

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

export function TableRow({ children, className }: TableSectionProps) {
  return (
    <tr className={cn("border-b border-line-row last:border-b-0", className)}>
      {children}
    </tr>
  );
}

// aria-sort is optional so a sortable header (inventory table, #287) can
// announce its direction to assistive tech; plain headers omit it and render
// exactly as before.
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

export function TableCell({
  children,
  className,
  colSpan,
}: TableSectionProps & { colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("px-card-x py-row-y", className)}>
      {children}
    </td>
  );
}
