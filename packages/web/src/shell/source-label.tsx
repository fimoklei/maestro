import { targetLabel } from "./target-label";

// Shared by the connect gate confirmation and the ⚙ steady state, so the two
// can't drift apart on rendering again (#211).
export function SourceLabel({
  path,
  label = "Local folder",
  compact = true,
}: {
  path: string;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="m-label">{label}</span>
      <span className="truncate font-mono text-fg text-mono-sm" title={path}>
        {compact ? targetLabel(path) : path}
      </span>
    </div>
  );
}
