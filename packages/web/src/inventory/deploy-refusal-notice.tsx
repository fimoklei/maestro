import { HttpError } from "../api/http";
import { Button } from "../ui/button";

// The two not-proven-clean refusals ADR-0006 turns into confirm-and-proceed.
// Branch on the code, never the message text (#66).
const FORCEABLE_REFUSALS = new Set([
  "deployed-diverged-from-lock",
  "deployed-unverifiable",
]);

// A refusal the user can override adds an inline "Reinstall fresh" button
// that re-runs the deploy with force. One affordance, both entry points.
export function DeployRefusalNotice({
  error,
  onReinstall,
  reinstalling,
}: {
  error: Error;
  onReinstall: () => void;
  reinstalling: boolean;
}) {
  const code = error instanceof HttpError ? error.code : undefined;
  const forceable = code !== undefined && FORCEABLE_REFUSALS.has(code);

  return (
    <span
      role="alert"
      className="flex flex-wrap items-center gap-2 text-amber-ink text-tag"
    >
      {error.message}
      {forceable ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={reinstalling}
          onClick={onReinstall}
        >
          Reinstall fresh — local changes will be lost
        </Button>
      ) : null}
    </span>
  );
}
