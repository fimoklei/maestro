import { HttpError } from "../api/http";
import { Button } from "../ui/button";

// The two not-proven-clean refusals ADR-0006 turns into confirm-and-proceed.
// Branch on the code, never the message text (#66).
const FORCEABLE_REFUSALS = new Set([
  "deployed-diverged-from-lock",
  "deployed-unverifiable",
]);

// The server sends its own reading of the recorded type, never apm prose
// (ADR-0018); this only reads past `message` to render it.
function recordedPackageType(error: Error): string | null {
  if (!(error instanceof HttpError)) {
    return null;
  }
  const value = (error.body as { packageType?: unknown } | undefined)
    ?.packageType;
  return typeof value === "string" ? value : null;
}

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
  // The type apm recorded, when the server sends one. Named here because the
  // recovery differs per type, and the message table cannot know it (#358).
  const packageType = recordedPackageType(error);

  return (
    <span
      role="alert"
      className="flex flex-wrap items-center gap-2 text-amber-ink text-tag"
    >
      {error.message}
      {packageType ? <span>Recorded type: {packageType}.</span> : null}
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
