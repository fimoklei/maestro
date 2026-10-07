import type { ReactNode } from "react";

/** A short state word in an outline, such as a pull request's Open. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-chip border border-gray-7 px-tight text-gray-12">
      {children}
    </span>
  );
}
