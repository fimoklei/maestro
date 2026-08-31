import type { RegistrationOutcome } from "../registry/use-register-repos";
import { targetLabel } from "./target-label";

// What happened to each repo of a registration run (#175). Rows arrive in
// selection order and never re-sort, so an already-read line stays put.
export function BrowseRunReport({
  outcomes,
  isRegistering,
  runPaths,
}: {
  outcomes: readonly RegistrationOutcome[];
  isRegistering: boolean;
  // The whole run, in selection order, so the list is complete before the
  // server answers. Absent: the outcomes are all the run there is to show.
  runPaths?: readonly string[];
}) {
  const registered = outcomes.filter((outcome) => outcome.ok).length;
  const skipped = outcomes.length - registered;
  const byRequested = new Map(
    outcomes.map((outcome) => [outcome.requestedPath, outcome]),
  );
  const paths =
    runPaths && runPaths.length > 0
      ? runPaths
      : outcomes.map((outcome) => outcome.requestedPath);
  // Registration canonicalizes, so a row's name is its stored path where the
  // server has answered — and that is what the labels disambiguate against.
  const shownPaths = paths.map(
    (requestedPath) => byRequested.get(requestedPath)?.path ?? requestedPath,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto px-3.5 py-3">
      <p role="status" className="mb-2 font-mono text-data">
        {isRegistering ? (
          <span className="text-fg-2">
            Registering repositories…
            {paths.length > 0 ? ` ${outcomes.length} of ${paths.length}` : ""}
          </span>
        ) : (
          // Only what happened: a green "0 registered" would signal rest where
          // the run delivered none.
          <>
            {registered > 0 ? (
              <span className="text-green-ink">✓ {registered} registered</span>
            ) : null}
            {registered > 0 && skipped > 0 ? (
              <span className="text-dim"> · </span>
            ) : null}
            {skipped > 0 ? (
              <span className="text-danger-ink">✕ {skipped} skipped</span>
            ) : null}
          </>
        )}
      </p>
      <ul
        aria-label="Registration results"
        className="divide-y divide-line-row border-line-row border-t"
      >
        {paths.map((requestedPath) => {
          const outcome = byRequested.get(requestedPath);
          const shown = outcome?.path ?? requestedPath;
          return (
            <li
              // Keyed on the request, not the stored path — a symlink and its
              // target resolve to one stored path and would collide on `path`.
              key={requestedPath}
              className="py-[7px]"
            >
              <span className="flex items-baseline gap-2">
                <span
                  aria-hidden="true"
                  className={`w-3 shrink-0 text-right text-tag ${
                    outcome === undefined
                      ? "text-dim"
                      : outcome.ok
                        ? "text-green-ink"
                        : "text-danger-ink"
                  }`}
                >
                  {outcome === undefined ? "·" : outcome.ok ? "✓" : "✕"}
                </span>
                <span
                  title={shown}
                  className={`truncate font-mono text-mono-sm ${
                    outcome === undefined ? "text-dim" : "text-fg"
                  }`}
                >
                  {targetLabel(shown, shownPaths)}
                </span>
                {/* The glyph carries the outcome on screen; this carries it to
                    a screen reader, which cannot see the colour or the mark. */}
                {outcome === undefined ? (
                  <span className="sr-only">waiting</span>
                ) : outcome.ok ? (
                  <span className="sr-only">registered</span>
                ) : null}
              </span>
              {outcome !== undefined && !outcome.ok ? (
                // Under the path it refused, not beside it: a long refusal must
                // never squeeze the path it is about (DESIGN.md §5, Inputs).
                <span className="mt-0.5 block pl-5 font-mono text-danger-ink text-tag">
                  {outcome.reason}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
