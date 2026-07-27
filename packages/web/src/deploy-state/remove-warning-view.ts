// The one owner of "what does the removal confirmation warn about". It folds
// the pre-confirmation check's three outcomes — answered, still running, failed
// — into the single state the dialog renders, and applies the J04 rule to
// consent: a check that could not run is never reported as nothing-to-lose.
// Pure and framework-free, so both the dialog and its host read one rule
// instead of each re-deriving it.
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

export function removeWarningView(query: {
  data: RemovePreflight | undefined;
  isPending: boolean;
  isError: boolean;
}): RemoveWarningState {
  if (query.isError) {
    return "check-failed";
  }
  if (query.data === undefined) {
    return query.isPending ? "checking" : "none";
  }
  switch (query.data.warning) {
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
