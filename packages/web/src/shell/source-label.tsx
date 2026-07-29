import { targetLabel } from "./target-label";

// Shared by the connect gate confirmation and the ⚙ steady state, so the two
// can't drift apart on rendering again (#211).
export function SourceLabel({ path }: { path: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="m-label">Source · local folder</span>
      <span className="truncate font-mono text-fg text-mono-sm" title={path}>
        {targetLabel(path)}
      </span>
    </div>
  );
}
