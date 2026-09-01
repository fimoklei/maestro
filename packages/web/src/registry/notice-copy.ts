import type { RepoPathError } from "@maestro/core";
import { HttpError } from "../api/http";
import { requestShapeNotice } from "../ui/notice-table";

// The register run's report has no heading above it, so each sentence names
// its own subject — unlike the connect form's four, which start at the
// recovery (`inventory/connect-notice.ts`, #465 decision 9).
const registerSentences: Record<RepoPathError | "central-inventory", string> = {
  missing: "No path was sent. Name the repository's absolute path.",
  relative:
    "A repository is registered by its absolute path, like /Users/name/code/my-repo.",
  "not-found":
    "Nothing exists there to register. Check the spelling, or pick another folder.",
  "not-a-directory":
    "That path names a file. Register the folder that holds it.",
  "central-inventory":
    "The Harness holds the skills to deploy, not a target. Register a repository that uses skills instead.",
};

// A failure the table does not cover: a dropped connection, a 500, or a code
// this build predates.
const NOT_ANSWERED =
  "The Maestro server did not answer. Register the repository again.";

/**
 * The register run's own sentence for one refused repository. Required return,
 * never `?? error.message`: an uncovered code would otherwise render the HTTP
 * wrapper's own "Request failed with status 422." on screen (#690).
 */
export function registerMessage(error: unknown): string {
  if (!(error instanceof HttpError) || error.code === undefined) {
    return NOT_ANSWERED;
  }
  // The report row is one line with nowhere to put a `detail`, so it takes the
  // shared notice's sentence alone.
  const requestShape = requestShapeNotice(error);
  if (requestShape) {
    return requestShape.message;
  }
  return (
    registerSentences[error.code as RepoPathError | "central-inventory"] ??
    NOT_ANSWERED
  );
}
