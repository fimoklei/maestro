// Applies J04 to consent (deployed-view.ts): a check that could not run is
// never reported as nothing-to-lose. A refusal (removal cannot happen) is kept
// apart from a failure (nobody knows the cost yet) — they mean opposites (#385).
import type {
  ReclaimPreview,
  RemoveCheck,
  RemovePreflightError,
  RemoveWarning,
} from "@maestro/core";
import { HttpError } from "../api/http";
import type { RemovePreflight } from "./use-remove-preflight";

// What the check says about one row's copy. "checking" is not among them: an
// unfinished check has made no claim about any row (#414).
export type RemoveRowWarning =
  // The check ran and found the copy still matching its lockfile.
  | "none"
  // The copy carries edits the removal would destroy.
  | "local-edits"
  // The check ran and found nothing recorded to verify the copy against.
  | "cannot-verify"
  // The check never ran for this copy. Apart from the state above on purpose:
  // borrowing its wording would state a cause nothing observed.
  | "check-failed";

export type RemoveCheckState =
  // No per-row answer exists yet: the check is still running, or the request
  // that would have carried the answers failed. Either is true of every row at
  // once, so it is stated once.
  | { kind: "unanswered"; warning: "checking" | "check-failed" }
  // The repo scope's one answer for its one row. A repo's deployed copy spans
  // several tool subtrees, so the aggregate is the honest thing to state.
  | { kind: "repo"; warning: RemoveRowWarning }
  // The global scope's answer per detected tool, keyed by apm's own tool token.
  // A tool missing from the map was never reported on, which is not the same as
  // a clean copy.
  | { kind: "per-tool"; warnings: Readonly<Record<string, RemoveRowWarning>> };

export type RemovePreflightView =
  // Still on the table: answered, running, or could not run — all leave the
  // user free to go ahead. Reclaim rides along rather than a second query read,
  // which could name paths under a message saying the check can't run.
  | {
      kind: "offered";
      check: RemoveCheckState;
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

const unanswered = (
  warning: "checking" | "check-failed",
): RemovePreflightView => ({
  kind: "offered",
  check: { kind: "unanswered", warning },
  reclaim: [],
});

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
      ? unanswered("check-failed")
      : {
          kind: "refused",
          message: refusal,
        };
  }
  // Also covers the query being switched off, which happens only with no
  // dialog on screen to read the answer.
  if (query.data === undefined) {
    return unanswered("checking");
  }
  const check = readCheck(query.data);
  if (check === null) {
    return unanswered("check-failed");
  }
  return {
    kind: "offered",
    check,
    reclaim: query.data.reclaim?.previews ?? [],
  };
}

// Nothing validates this body, so an unreadable 200 falls back to null,
// never a clean copy (J04) — reading past it throws in front of an irreversible action.
function readCheck(data: RemovePreflight | undefined): RemoveCheckState | null {
  const check = (data as { check?: unknown } | undefined)?.check as
    | Partial<RemoveCheck>
    | undefined;
  if (check?.scope === "repo") {
    return { kind: "repo", warning: rowWarningFor(check.warning ?? null) };
  }
  if (check?.scope === "global" && Array.isArray(check.tools)) {
    return {
      kind: "per-tool",
      warnings: Object.fromEntries(
        check.tools.map((entry) => [
          entry?.tool,
          rowWarningFor(entry?.warning ?? null),
        ]),
      ),
    };
  }
  return null;
}

function rowWarningFor(warning: RemoveWarning | null): RemoveRowWarning {
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
