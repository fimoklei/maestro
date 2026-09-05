import { HttpError } from "../api/http";
import { deployNotice, linkedFolderNotice } from "../deploy-state/notice-copy";
import { Notice } from "../ui/notice";

// The extra facts the server sends beside the code — its own reading of apm's
// recorded type, and the link path core built (ADR-0018, never apm prose). Read
// only under the code that sends the field, so no other refusal can pick one up.
function errorBodyField(
  error: Error,
  codes: readonly string[],
  field: "packageType" | "linkedPath",
): string | null {
  if (
    !(error instanceof HttpError) ||
    error.code === undefined ||
    !codes.includes(error.code)
  ) {
    return null;
  }
  const value = (error.body as Record<string, unknown> | undefined)?.[field];
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
  const base = deployNotice(error);
  // The link the server named, when it could: the table's folder-shaped
  // sentence cannot spell out a path it does not know (#748).
  const linkedPath = errorBodyField(
    error,
    ["destination-symlinked"],
    "linkedPath",
  );
  const notice =
    linkedPath === null ? base : { ...base, ...linkedFolderNotice(linkedPath) };
  // The type apm recorded, when the server sends one. Named here because the
  // recovery differs per type, and the copy table cannot know it (#358). It
  // replaces the row's own detail rather than joining it (`copy.md`).
  const packageType = errorBodyField(
    error,
    ["deployed-unsupported-package-type", "deploy-recorded-invalid"],
    "packageType",
  );
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
