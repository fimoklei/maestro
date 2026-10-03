import type { ReactNode } from "react";

/** A screen's one live region: heard, not seen. Feature code reaches it through the table screen or `useScreenStatus`. */
export function StatusRegion({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="sr-only">
      {children}
    </div>
  );
}
