import type { RegistrationOutcome } from "../registry/use-register-repos";

// What happened to each repo of a registration run (#175). Rows arrive in
// selection order and never re-sort, so an already-read line stays put.
export function BrowseRunReport({
  outcomes,
  isRegistering,
}: {
  outcomes: readonly RegistrationOutcome[];
  isRegistering: boolean;
}) {
  const registered = outcomes.filter((outcome) => outcome.ok).length;
  const skipped = outcomes.length - registered;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-3.5 py-3">
      <p className="m-label" aria-live="polite">
        {isRegistering
          ? "Registering…"
          : `Result · ${registered} registered · ${skipped} skipped`}
      </p>
      <ul aria-label="Registration results" className="flex flex-col gap-1">
        {outcomes.map((outcome) => (
          <li
            // Keyed on the request, not the stored path — a symlink and its
            // target resolve to one stored path and would collide on `path`.
            key={outcome.requestedPath}
            className="flex items-baseline justify-between gap-2"
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <span
                className={
                  outcome.ok
                    ? "text-green-ink text-tag"
                    : "text-amber-ink text-tag"
                }
              >
                {outcome.ok ? "✓" : "✕"}
              </span>
              <span className="truncate font-mono text-fg text-mono-sm">
                {outcome.path}
              </span>
            </span>
            <span
              className={`whitespace-nowrap font-mono text-tag ${
                outcome.ok ? "text-dim" : "text-amber-ink"
              }`}
            >
              {outcome.reason}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
