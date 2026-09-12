import { HttpError } from "../api/http";
import { deployNotice, linkedFolderNotice } from "../deploy-state/notice-copy";
import { Notice } from "../ui/notice";

// The extra facts the server sends beside the code — its own reading of apm's
// recorded type, and the link path core built (ADR-0018, never apm prose). Read
// only under the code that sends the field, so no other refusal can pick one up.
function errorBodyField(
  error: Error,
  codes: readonly string[],
  field: "packageType" | "linkedPath" | "copyReceipt",
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

// A refusal the user can override adds a "Deploy again" action carrying the
// receipt this refusal minted. Which refusals those are is the table's
// `warning` level, never the message text and never a second list (ADR-0006).
export function DeployRefusalNotice({
  error,
  onReinstall,
  reinstalling,
}: {
  error: Error;
  // The server's consent for the copies this refusal read. Absent only where
  // the server sent none, and the plain retry then restates the refusal with a
  // fresh one rather than claiming a consent nobody gave (#952).
  onReinstall: (confirmedCopyReceipt?: string) => void;
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

  // Minted only where consent can clear the refusal — the same two codes the
  // copy table levels as a warning (#952).
  const copyReceipt = errorBodyField(
    error,
    ["deployed-diverged-from-lock", "deployed-unverifiable"],
    "copyReceipt",
  );

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
                onClick: () => onReinstall(copyReceipt ?? undefined),
                disabled: reinstalling,
              },
            }
          : { ...notice, level: notice.level, detail }
      }
    />
  );
}
