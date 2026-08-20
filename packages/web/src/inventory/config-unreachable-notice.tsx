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
        label: "the Maestro server is unreachable",
        message:
          "Nothing on this screen can load until it answers. Check that it is still running, then try again.",
        action: { label: "Try again", onClick: onRetry },
      }}
    />
  );
}
