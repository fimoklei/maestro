import type { RegistrationOutcome } from "../registry/use-register-repos";

// What happened to each repo of a registration run, one line apiece (issue
// #175). It replaces the picker's listing rather than sitting beside it: the
// dialog is the only window in which the user can read a failure, so the run
// gets the whole surface. Rows arrive in the order the user built the
// selection and never re-sort, so a line the user already read stays where it
// was while the ones below it land.
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
            // Keyed on what was asked for, not on what the registry stored:
            // a symlink and its target resolve to one stored path, so keying
            // on `path` would collide when both are selected.
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
