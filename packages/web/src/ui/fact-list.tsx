import type { ReactNode } from "react";
import { cn } from "./cn";

// A detail pane's facts (#1065): label beside value, one row per fact, in one
// two-column grid shared by every pane.
export function FactList({ children }: { children: ReactNode }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-panel gap-y-inline text-row">
      {children}
    </dl>
  );
}

export function FactRow({
  label,
  machine = false,
  title,
  children,
}: {
  label: string;
  /** A version, tag, path, ref or hash: the one thing Geist Mono sets. */
  machine?: boolean;
  /** The whole value on hover, where the row shortens it. */
  title?: string;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="font-ui text-gray-11 text-meta">{label}</dt>
      <dd
        className={cn(
          "m-0 min-w-0 truncate text-gray-12",
          machine ? "font-mono" : "font-ui",
        )}
        title={title}
      >
        {children}
      </dd>
    </>
  );
}
