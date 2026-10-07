import type { ReactNode } from "react";
import { cn } from "./cn";
import { Tooltip } from "./tooltip";

export function FactList({
  size,
  children,
}: {
  /** The text size of the surface: `row` in the detail pane, `meta` in a card. */
  size: "row" | "meta";
  children: ReactNode;
}) {
  return (
    <dl
      className={cn(
        "m-0 grid grid-cols-[auto_1fr] items-center gap-x-panel gap-y-inline",
        size === "row" ? "text-row" : "text-meta",
      )}
    >
      {children}
    </dl>
  );
}

export function FactRow({
  label,
  machine = false,
  fullValue,
  action,
  wrap = false,
  children,
}: {
  label: string;
  /** A version, tag, path, ref or hash: the one thing Geist Mono sets. */
  machine?: boolean;
  /** The whole value on hover and focus, where the row shortens it. */
  fullValue?: string;
  /** One control beside the value, for an action that changes this fact. */
  action?: ReactNode;
  /** A value that is the fact itself, such as a branch: it wraps. */
  wrap?: boolean;
  children: ReactNode;
}) {
  const value =
    fullValue === undefined ? (
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
    );
  return (
    <>
      <dt className="font-ui text-gray-11 text-meta">{label}</dt>
      <dd
        className={cn(
          "m-0 min-w-0 text-gray-12",
          // The tooltip trigger shortens itself, so its focus ring is not clipped.
          wrap
            ? "break-words"
            : fullValue === undefined && action === undefined && "truncate",
          machine ? "font-mono" : "font-ui",
        )}
      >
        {action === undefined ? (
          value
        ) : (
          <span className="flex items-center justify-between gap-inline">
            <span
              className={cn("min-w-0", fullValue === undefined && "truncate")}
            >
              {value}
            </span>
            <span className="flex flex-none">{action}</span>
          </span>
        )}
      </dd>
    </>
  );
}
