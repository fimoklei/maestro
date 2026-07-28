// Whether a failed removal can have left the target half-changed.
//
// The confirmation's mixed-state note follows this answer alone, so the timing
// is stated per error code rather than inferred from one. An unknown or
// code-less failure — a proxy 502, an HTML error page, a server that died
// mid-uninstall — is exactly the case where apm most likely did run, and the
// honest default there is "assume it landed" (#384).
import type { RemoveDeployedSkillError } from "@maestro/core";
import { HttpError } from "../api/http";

// A refusal the request-level guard sends before any route runs
// (`packages/server/src/origin-host-guard.ts`). Not part of the core union, so
// this list is maintained by hand alongside that file.
type GuardRefusalCode =
  | "unsupported-media-type"
  | "forbidden-host"
  | "forbidden-origin";

// Every failure code `POST /api/deploy/remove` can send: the guard's, the
// route's body check, and the use-case's own
// (`packages/server/src/app.ts` → `removeErrorResponses`). The core half is
// compile-checked, so a new `RemoveDeployedSkillError` is a type error here
// rather than a silent "attempted".
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
  // The lock is held by another apm write, so this request never reached apm.
  // Whatever that other change is doing is its own to report.
  "remove-in-progress": "before-apm",
  // apm ran and did not print its uninstall marker, so the removal is unproven.
  "remove-failed": "after-apm",
};

export function removalWasAttempted(error: unknown): boolean {
  // A thrown client-side error or a dropped connection says nothing about what
  // the server did with the request, and neither does an error body that
  // carried no code. Unknown is never quietly reported as safe (J04).
  if (!(error instanceof HttpError) || error.code === undefined) {
    return true;
  }
  return REFUSAL_TIMING[error.code as RemovalFailureCode] !== "before-apm";
}

// The codes this module classifies as refusing before apm runs, for the test
// that checks the table against a hand-written list. Derived on purpose: the
// test names the codes itself, so a misclassification here turns it red.
export const preApmRefusalCodes = (): readonly string[] =>
  Object.keys(REFUSAL_TIMING).filter(
    (code) => REFUSAL_TIMING[code as RemovalFailureCode] === "before-apm",
  );
