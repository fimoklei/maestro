import { Button } from "../ui/button";

// Shown when the config query errors on a first-run surface, which otherwise
// waits on an indefinite "Loading…" with no way out (#103). Presentational —
// caller owns the query and passes its refetch as onRetry.
export function ConfigUnreachableNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="text-amber-ink text-tag">
        Could not reach the Maestro server. Check that it is running, then try
        again.
      </p>
      <Button variant="quiet" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
