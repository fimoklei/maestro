// Applies J04 to consent (deployed-view.ts): a check that could not run is
// never reported as nothing-to-lose. A refusal (removal cannot happen) is kept
// apart from a failure (nobody knows the cost yet) — they mean opposites (#385).
import type { ReclaimPreview, RemovePreflightError } from "@maestro/core";
import { HttpError } from "../api/http";
import type { RemovePreflight } from "./use-remove-preflight";

export type RemoveWarningState =
  // The check ran and found the copy still matching its lockfile.
  | "none"
  // The check has not answered yet.
  | "checking"
  // The copy carries edits the removal would destroy.
  | "local-edits"
  // The check ran and found nothing recorded to verify the copy against.
  | "cannot-verify"
  // The check never ran — the server could not read the copy, or the request
  // itself failed. Apart from the state above on purpose: borrowing its wording
  // would state a cause nothing observed.
  | "check-failed";

export type RemovePreflightView =
  // Still on the table: answered, running, or could not run — all leave the
  // user free to go ahead. Reclaim rides along rather than a second query read,
  // which could name paths under a message saying the check can't run.
  | {
      kind: "warning";
      warning: RemoveWarningState;
      reclaim: readonly ReclaimPreview[];
    }
  // The server refused outright — no confirm offered, since offering one would
  // be a lie the user pays a round-trip to find out.
  | { kind: "refused"; message: string };

// Keyed by core's own error union, so a new refusal there is a type error here.
// Allowlist, not blocklist (code-standards.md): an unrecognised code falls
// through to the failure state that still lets the user through.
const REFUSES_THE_REMOVAL: Record<
  RemovePreflightError | "invalid-body",
  boolean
> = {
  "invalid-body": true,
  "unsupported-primitive-type": true,
  "invalid-name": true,
  "repo-not-registered": true,
  "no-supported-tool": true,
  "preflight-failed": false,
};

// The server's wording when it refused, or null for anything else — a network
// failure, a code-less response, or a code this build does not recognise.
function refusalMessage(error: unknown): string | null {
  if (!(error instanceof HttpError) || error.code === undefined) {
    return null;
  }
  const refuses =
    REFUSES_THE_REMOVAL[error.code as keyof typeof REFUSES_THE_REMOVAL];
  return refuses === true ? error.message : null;
}

export function removePreflightView(query: {
  data: RemovePreflight | undefined;
  error: unknown;
  isPending: boolean;
  isError: boolean;
}): RemovePreflightView {
  // Error before data: a failed refetch leaves a now-disproved answer in hand.
  if (query.isError) {
    const refusal = refusalMessage(query.error);
    return refusal === null
      ? { kind: "warning", warning: "check-failed", reclaim: [] }
      : { kind: "refused", message: refusal };
  }
  if (query.data === undefined) {
    return {
      kind: "warning",
      warning: query.isPending ? "checking" : "none",
      reclaim: [],
    };
  }
  return {
    kind: "warning",
    warning: warningFor(query.data.warning),
    reclaim: query.data.reclaim?.previews ?? [],
  };
}

function warningFor(warning: RemovePreflight["warning"]): RemoveWarningState {
  switch (warning) {
    case "local-edits-will-be-lost":
      return "local-edits";
    case "cannot-verify-local-edits":
      return "cannot-verify";
    case "check-did-not-run":
      return "check-failed";
    default:
      return "none";
  }
}
