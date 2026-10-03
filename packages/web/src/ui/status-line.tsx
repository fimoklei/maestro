import type { ReactNode } from "react";

/** A shown line saying what is under way, heard as it changes. */
export function StatusLine({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="m-0 font-ui text-gray-11 text-meta">
      {children}
    </p>
  );
}
