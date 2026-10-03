import type { ReactNode } from "react";

/** A screen's one live region: heard, not seen. */
export function StatusRegion({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="sr-only">
      {children}
    </div>
  );
}

/** A shown line saying what is under way, heard as it changes. */
export function StatusLine({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="m-0 font-ui text-gray-11 text-meta">
      {children}
    </p>
  );
}

/** Shown content heard as it changes, named apart from its sibling regions. */
export function LiveRegion({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-label={label}>
      {children}
    </div>
  );
}
