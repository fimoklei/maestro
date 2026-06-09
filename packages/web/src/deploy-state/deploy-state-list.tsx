import type { DeployedPrimitive, SkippedEntry } from "./use-deploy-state";

// Presentational deploy-state for one repo. The empty state is explicit so a
// registered-but-empty repo never shows a bare blank. Skipped entries are shown
// as a warning, never dropped silently, so the cockpit cannot quietly hide a
// primitive it does not yet understand.
export function DeployStateList({
  primitives,
  skipped,
}: {
  primitives: DeployedPrimitive[];
  skipped: SkippedEntry[];
}) {
  // "Nothing deployed" only when there is genuinely nothing — not when entries
  // exist but were skipped as unsupported. Showing it alongside a skipped
  // warning would be the cockpit lying about an empty repo.
  const isEmpty = primitives.length === 0 && skipped.length === 0;

  return (
    <>
      {isEmpty && <p>Nothing deployed here.</p>}
      {primitives.length > 0 && (
        <ul>
          {primitives.map((primitive) => (
            <li key={primitive.name}>
              <strong>{primitive.name}</strong>:{" "}
              <span>{primitive.version}</span>
            </li>
          ))}
        </ul>
      )}
      {skipped.length > 0 && (
        <ul>
          {skipped.map((entry) => (
            <li key={entry.virtualPath}>
              Skipped {entry.virtualPath} (unsupported type {entry.packageType}
              ).
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
