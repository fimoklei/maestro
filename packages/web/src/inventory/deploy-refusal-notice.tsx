import { HttpError } from "../api/http";
import { deployNotice } from "../deploy-state/notice-copy";
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
  const notice = deployNotice(error);
  // The type apm recorded, when the server sends one. Named here because the
  // recovery differs per type, and the copy table cannot know it (#358). It
  // replaces the row's own detail rather than joining it (`copy.md`).
  const packageType = recordedPackageType(error);
  const detail =
    packageType === null
      ? notice.detail
      : `apm recorded this package as ${packageType}.`;

  return (
    <Notice
      trigger="user-action"
      notice={
        notice.level === "warning"
          ? {
              ...notice,
              level: "warning",
              detail,
              // Runs the sentence's last instruction, verb for verb; the cost
              // it charges is stated in the sentence itself (F8).
              action: {
                label: "Deploy again",
                onClick: onReinstall,
                disabled: reinstalling,
              },
            }
          : { ...notice, level: notice.level, detail }
      }
    />
  );
}
