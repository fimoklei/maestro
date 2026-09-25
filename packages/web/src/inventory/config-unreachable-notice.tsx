import { Notice } from "../ui/notice";

// Shown when the config query errors on a first-run surface, which would
// otherwise wait on "Loading…" forever (#103).
export function ConfigUnreachableNotice({ onRetry }: { onRetry: () => void }) {
  return (
    // The surface failed to load; nothing here followed a click (#465).
    <Notice
      trigger="load"
      notice={{
        level: "error",
        label: "Maestro server unreachable",
        message:
          "Nothing on this screen loads until the Maestro server answers. Check that it is running, then load the screen again.",
        action: { label: "Load the screen again", onClick: onRetry },
      }}
    />
  );
}
