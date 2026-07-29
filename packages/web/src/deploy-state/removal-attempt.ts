// Whether a failed removal can have left the target half-changed. An unknown
// or code-less failure defaults to "assume it landed" (#384).
import type { RemoveDeployedSkillError } from "@maestro/core";
import { HttpError } from "../api/http";

// The guard's refusals (packages/server/src/origin-host-guard.ts), maintained
// by hand — not part of the core union.
type GuardRefusalCode =
  | "unsupported-media-type"
  | "forbidden-host"
  | "forbidden-origin";

// Every failure code `POST /api/deploy/remove` can send. The core half is
// compile-checked, so a new `RemoveDeployedSkillError` is a type error here.
type RemovalFailureCode =
  | RemoveDeployedSkillError
  | GuardRefusalCode
  | "invalid-body";

// When each refusal happens relative to the `apm uninstall` call. Only
// "after-apm" can leave the target half-changed.
const REFUSAL_TIMING: Record<RemovalFailureCode, "before-apm" | "after-apm"> = {
  "unsupported-media-type": "before-apm",
  "forbidden-host": "before-apm",
  "forbidden-origin": "before-apm",
  "invalid-body": "before-apm",
  "unsupported-primitive-type": "before-apm",
  "invalid-name": "before-apm",
  "repo-not-registered": "before-apm",
  "no-supported-tool": "before-apm",
  "not-deployed": "before-apm",
  "lockfile-malformed": "before-apm",
  "ref-unresolvable": "before-apm",
  "deployed-unreadable": "before-apm",
  "remove-in-progress": "before-apm",
  "remove-failed": "after-apm",
};

export function removalWasAttempted(error: unknown): boolean {
  // Unknown is never quietly reported as safe (J04, see deployed-view.ts).
  if (!(error instanceof HttpError) || error.code === undefined) {
    return true;
  }
  return REFUSAL_TIMING[error.code as RemovalFailureCode] !== "before-apm";
}

// For the test that checks this table against a hand-written list.
export const preApmRefusalCodes = (): readonly string[] =>
  Object.keys(REFUSAL_TIMING).filter(
    (code) => REFUSAL_TIMING[code as RemovalFailureCode] === "before-apm",
  );
