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
import { type DeployStateNotice, removeNotice } from "./notice-copy";
import type { RemovePreflight } from "./use-remove-preflight";

// What the check says about one row's copy. "checking" is not among them: an
// unfinished check has made no claim about any row (#414).
export type RemoveRowWarning =
  // The check ran and found the copy still matching its lockfile.
  | "none"
  // The check ran and found nothing recorded to verify the copy against. A
  // copy with recorded edits never reaches a row: the server refuses it (#775).
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
  // be a lie the user pays a round-trip to find out. The code rides along: a
  // bulk names the refusal in a slot the message does not fit, and its run is
  // told which refusal took the target out (#423).
  | { kind: "refused"; code: RefusalCode; notice: DeployStateNotice };

export type RefusalCode = RemovePreflightError | "invalid-body";

// Keyed by core's own error union, so a new refusal there is a type error here.
// Allowlist, not blocklist (code-standards.md): an unrecognised code falls
// through to the failure state that still lets the user through.
const REFUSES_THE_REMOVAL: Record<RefusalCode, boolean> = {
  "invalid-body": true,
  "unsupported-primitive-type": true,
  "invalid-name": true,
  "repo-not-registered": true,
  "no-supported-tool": true,
  "deployed-diverged-from-lock": true,
  "deployed-diverged-pinned-per-skill": true,
  "preflight-failed": false,
};

// The server's refusal, or null for anything else — a network failure, a
// code-less response, or a code this build does not recognise.
function refusal(
  error: unknown,
): { code: RefusalCode; notice: DeployStateNotice } | null {
  if (!(error instanceof HttpError) || error.code === undefined) {
    return null;
  }
  const code = error.code as RefusalCode;
  return REFUSES_THE_REMOVAL[code] === true
    ? { code, notice: removeNotice(error) }
    : null;
}

// Which refusal the bulk run is told about (#422), read off the same view the
// screen reads. "invalid-body" never travels — it says the request was
// malformed, not that the target refused.
export function refusedPreflightCode(
  view: RemovePreflightView,
): RemovePreflightError | null {
  if (view.kind !== "refused" || view.code === "invalid-body") {
    return null;
  }
  return view.code;
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
  // Not isPending or isFetching: isPending goes false for good once any answer
  // is cached, and isFetching misses a fetch paused offline. Only fetchStatus
  // tells an unsettled check from a settled one (#381).
  fetchStatus: "fetching" | "paused" | "idle";
  isError: boolean;
}): RemovePreflightView {
  // Ahead of both the failure and the data below: whatever either still holds
  // belongs to the check before this one. Its warning and reclaim token would
  // price a removal nothing has checked yet (#381).
  if (query.fetchStatus !== "idle") {
    return unanswered("checking");
  }
  // Error before data: a failed refetch leaves a now-disproved answer in hand.
  if (query.isError) {
    const refused = refusal(query.error);
    return refused === null
      ? unanswered("check-failed")
      : { kind: "refused", ...refused };
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
    case "cannot-verify-local-edits":
      return "cannot-verify";
    case "check-did-not-run":
      return "check-failed";
    default:
      return "none";
  }
}
