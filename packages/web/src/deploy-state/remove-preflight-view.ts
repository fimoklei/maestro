// The one owner of "what does the removal confirmation say about the check that
// ran in front of it". It folds the check's outcomes into the values the dialog
// renders, and applies the J04 rule to consent: a check that could not run is
// never reported as nothing-to-lose. A refusal is kept apart from a failure,
// because they mean opposite things — one says the removal cannot happen, the
// other says nobody knows yet what it would cost (#385).
// Pure and framework-free, so both the dialog and its host read one rule
// instead of each re-deriving it.
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
  // The removal is still on the table: the check answered, is still running, or
  // could not run. Any of those leaves the user free to go ahead. The leftover
  // copies ride along rather than being read off the query a second time — a
  // query holds the previous answer's data through a failing refetch, so a
  // second reader would name paths the removal is about to delete underneath a
  // message saying it cannot run.
  | {
      kind: "offered";
      check: RemoveCheckState;
      reclaim: readonly ReclaimPreview[];
    }
  // The server refused the request itself, in its own words. The removal cannot
  // succeed, so the dialog states the reason and offers no confirm — offering
  // one would be a lie the user pays a round-trip to find out.
  | { kind: "refused"; message: string };

// Which preflight errors mean the removal itself cannot succeed. Keyed by
// core's own error union, so a refusal added there cannot ship without a
// decision here. `invalid-body` is the route's own body-shape refusal and sits
// outside that union, but means the same thing to the user.
// An allowlist, never a blocklist (code-standards.md): a code this build has
// never heard of says nothing about whether the removal can succeed, so it
// falls through to the failure state that still lets the user through.
const REFUSES_THE_REMOVAL: Record<
  RemovePreflightError | "invalid-body",
  boolean
> = {
  "invalid-body": true,
  "unsupported-primitive-type": true,
  "invalid-name": true,
  "repo-not-registered": true,
  "no-supported-tool": true,
  // The server tried and could not answer. That settles nothing about the
  // removal, so it stays offered.
  "preflight-failed": false,
};

// The server's wording when it refused, or null for anything else — a network
// failure, a code-less response, or a code this build does not recognise.
function refusalMessage(error: unknown): string | null {
  if (!(error instanceof HttpError) || error.code === undefined) {
    return null;
  }
  // The lookup takes an arbitrary string, so an unrecognised code reads as
  // undefined rather than matching.
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
  // Read the error before the data: a failed refetch leaves the previous
  // answer in hand, and that answer describes a check this one just disproved.
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

// Nothing validates this body, so a server one version away answers 200 with a
// shape this build cannot read. Null for every one of them: an answer nobody
// can read is not a clean copy (J04), and reading past it throws in the middle
// of the one screen standing in front of an irreversible action.
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
