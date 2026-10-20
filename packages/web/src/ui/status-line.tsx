import type { ReactNode } from "react";

/** A shown line saying what is under way, heard as it changes. */
export function StatusLine({
  id,
  children,
}: {
  /** For a blocked control's aria-describedby. */
  id?: string;
  children: ReactNode;
}) {
  return (
    <p id={id} role="status" className="m-0 font-ui text-gray-11 text-meta">
      {children}
    </p>
  );
}
