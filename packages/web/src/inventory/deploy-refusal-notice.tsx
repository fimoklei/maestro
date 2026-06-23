import { HttpError } from "../api/http";
import { Button } from "../ui/button";

// The two not-proven-clean refusals that ADR-0006 turns into confirm-and-proceed:
// verified edits, and a pre-0.20.0 copy with no baseline. Both share one action
// (a forced reinstall) but carry distinct server messages, so we branch on the
// code, never the message text (#66).
const FORCEABLE_REFUSALS = new Set([
  "deployed-diverged-from-lock",
  "deployed-unverifiable",
]);

// Renders a deploy/update refusal as a readable alert, styled in Control Room
// (amber = attention). When the refusal is one the user can override — a
// not-proven-clean deployed copy — it adds an inline "Reinstall fresh" button
// that re-runs the same deploy with force. One affordance, both entry points
// (Deploy J07 and Update J08).
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
