import type { ReactNode } from "react";

// One block for every failure a remove dialog states — rendered separately,
// they once diverged into a glyphed refusal and a glyph-less error (#387).
// Danger red, not amber (#213).
export function FailureNote({
  id,
  label,
  message,
  children,
}: {
  id?: string;
  label: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <div
      id={id}
      role="alert"
      className="flex gap-1.5 rounded-control border border-danger-border bg-danger-bg px-2.5 py-2.5"
    >
      <span aria-hidden="true" className="font-mono text-danger-ink text-desc">
        ✕
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold font-ui text-danger-ink text-desc">
          {label}
        </span>
        <span className="font-ui text-desc text-fg-2">{message}</span>
        {children}
      </div>
    </div>
  );
}
