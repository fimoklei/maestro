import type { ReactNode } from "react";

// What a screen shows in place of a table that has nothing yet (copy.md →
// Empty state): what is empty, what appears here, and the one way to fill it.
export function EmptyState({
  title,
  body,
  icon,
  action,
}: {
  title: string;
  body: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-inline px-panel py-page text-center">
      {icon ? (
        <span className="flex size-10 items-center justify-center rounded-control border border-gray-7 bg-gray-2 text-gray-11">
          {icon}
        </span>
      ) : null}
      <h2 className="m-0 font-semibold text-gray-12 text-heading tracking-heading">
        {title}
      </h2>
      <p className="m-0 max-w-md text-gray-11 text-prose">{body}</p>
      {action ? <div className="mt-inline">{action}</div> : null}
    </div>
  );
}
