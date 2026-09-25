import type { ReactNode } from "react";
import { cn } from "./cn";
import { Tooltip } from "./tooltip";

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
  fullValue,
  children,
}: {
  label: string;
  /** A version, tag, path, ref or hash: the one thing Geist Mono sets. */
  machine?: boolean;
  /** The whole value on hover and focus, where the row shortens it. */
  fullValue?: string;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="font-ui text-gray-11 text-meta">{label}</dt>
      <dd
        className={cn(
          "m-0 min-w-0 text-gray-12",
          // The tooltip trigger shortens itself, so its focus ring is not clipped.
          fullValue === undefined && "truncate",
          machine ? "font-mono" : "font-ui",
        )}
      >
        {fullValue === undefined ? (
          children
        ) : (
          <Tooltip label={fullValue}>
            <span
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a tooltip trigger, so the whole value opens from the keyboard too (#1123)
              tabIndex={0}
              className="block truncate rounded-control focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2"
            >
              {children}
            </span>
          </Tooltip>
        )}
      </dd>
    </>
  );
}
