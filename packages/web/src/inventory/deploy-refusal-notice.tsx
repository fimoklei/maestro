import { HttpError } from "../api/http";
import { deployStateHeading } from "../deploy-state/notice-copy";
import { Notice } from "../ui/notice";

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

// A refusal the user can override adds a "Reinstall fresh" action that re-runs
// the deploy with force. One affordance, both entry points. Which refusals
// those are is the table's `warning` level (ADR-0006, #66) — never the message
// text, and never a second list here.
export function DeployRefusalNotice({
  error,
  onReinstall,
  reinstalling,
}: {
  error: Error;
  onReinstall: () => void;
  reinstalling: boolean;
}) {
  const heading = deployStateHeading(
    error instanceof HttpError ? error.code : undefined,
  );
  // The type apm recorded, when the server sends one. Named here because the
  // recovery differs per type, and the message table cannot know it (#358).
  const packageType = recordedPackageType(error);
  const aside =
    packageType === null ? undefined : `Recorded type: ${packageType}.`;

  return (
    <Notice
      trigger="user-action"
      notice={
        heading.level === "warning"
          ? {
              level: "warning",
              label: heading.label,
              message: error.message,
              aside,
              action: {
                label: "Reinstall fresh — local changes will be lost",
                onClick: onReinstall,
                disabled: reinstalling,
              },
            }
          : {
              level: heading.level,
              label: heading.label,
              message: error.message,
              aside,
            }
      }
    />
  );
}
