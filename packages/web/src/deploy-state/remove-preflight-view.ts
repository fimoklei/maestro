// A check that could not run is never reported as nothing-to-lose. A refusal
// (removal cannot happen) and a failure (cost unknown) mean opposites (#385).
import type {
  ReclaimPreview,
  RemoveCheck,
  RemovePreflightError,
  RemoveWarning,
} from "@maestro/core";
import { HttpError } from "../api/http";
import { type DeployStateNotice, removeNotice } from "./notice-copy";
import type { RemovePreflight } from "./use-remove-preflight";

// "checking" is not among them: an unfinished check has claimed nothing (#414).
export type RemoveRowWarning =
  | "none"
  // Nothing recorded to verify against. An edited copy never reaches a row:
  // the server refuses it (#775).
  | "cannot-verify"
  | "check-failed";

export type RemoveCheckState =
  // No per-row answer yet: still running, or the request failed.
  | { kind: "unanswered"; warning: "checking" | "check-failed" }
  | { kind: "repo"; warning: RemoveRowWarning }
  // A tool missing from the map was never reported on, which is not a clean copy.
  | { kind: "per-tool"; warnings: Readonly<Record<string, RemoveRowWarning>> };

export type RemovePreflightView =
  // Reclaim rides along rather than a second query read, which could name
  // paths under a message saying the check can't run.
  | {
      kind: "offered";
      check: RemoveCheckState;
      reclaim: readonly ReclaimPreview[];
    }
  // The code rides along so a bulk run can name which refusal took the target out (#423).
  | { kind: "refused"; code: RefusalCode; notice: DeployStateNotice };

export type RefusalCode = RemovePreflightError | "invalid-body";

// Keyed by core's error union, so a new refusal there is a type error here.
// An unrecognised code falls through to the failure state.
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

// "invalid-body" never travels: it says the request was malformed, not that
// the target refused.
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
  // is cached, and isFetching misses a fetch paused offline (#381).
  fetchStatus: "fetching" | "paused" | "idle";
  isError: boolean;
}): RemovePreflightView {
  // Ahead of both the failure and the data: either still holds the previous
  // check's answer, which would price an unchecked removal (#381).
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

// Nothing validates this body, so an unreadable 200 falls back to null, never
// a clean copy: reading past it throws in front of an irreversible action.
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
