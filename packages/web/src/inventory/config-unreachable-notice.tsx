import { Notice } from "../ui/notice";

// Shown when the config query errors on a first-run surface, which otherwise
// waits on an indefinite "Loading…" with no way out (#103). Presentational —
// caller owns the query and passes its refetch as onRetry.
export function ConfigUnreachableNotice({ onRetry }: { onRetry: () => void }) {
  return (
    // The surface failed to load; nothing here followed a click (#465).
    <Notice
      trigger="load"
      notice={{
        level: "error",
        label: "Maestro server unreachable",
        message:
          "Nothing on this screen loads until the Maestro server answers. Check that it is running, then try again.",
        action: { label: "Try again", onClick: onRetry },
      }}
    />
  );
}
