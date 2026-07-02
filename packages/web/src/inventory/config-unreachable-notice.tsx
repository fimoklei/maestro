import { Button } from "../ui/button";

// Shown when the inventory-config query errors on a first-run surface (the gate
// on /welcome, the register step's guard on /welcome/repos). Both guards wait
// for a *successful* config answer, so a query error would otherwise leave them
// on an indefinite "Loading…" with no message and no way out (issue #103).
// Instead: a plain-language "couldn't reach the server" line and a retry that
// re-runs the config query — on success the surface resumes its normal gate/
// guard behavior. Presentational only: the caller owns the query and passes its
// refetch as onRetry, so this component stays reusable across both surfaces.
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
