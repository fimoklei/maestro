import { targetLabel } from "./target-label";

// The connected source block — "Source · local folder" over the identifying tail
// of the local clone's path. Shared by the connect gate's success confirmation
// and the ⚙ Inventory source steady state so a single rendering exists: the two
// used to split, one via targetLabel and one on the raw path, which is exactly
// the drift #211's shortening was meant to end. The full path stays reachable on
// hover via a native title tooltip.
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
