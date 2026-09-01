import type { RepoPathError } from "@maestro/core";

// The register run's report has no heading above it, so each sentence names
// its own subject — unlike the connect form's four, which start at the
// recovery (`inventory/connect-notice.ts`, #465 decision 9).
const registerSentences: Record<RepoPathError | "central-inventory", string> = {
  missing:
    "Nothing can be registered without one. Name the repository's absolute path.",
  relative:
    "Start at the filesystem root, for example /Users/name/code/my-repo.",
  "not-found":
    "Nothing exists there to register. Check the spelling, or browse to the repository instead.",
  "not-a-directory":
    "It names a file, and only a repository folder can be registered. Choose the folder that holds it.",
  "central-inventory":
    "The harness is where skills come from, not a target they are deployed to. Register a repository that consumes skills instead.",
};

// The registration's own sentence, or undefined for a code it does not refuse
// with — a network failure, or one this build predates.
export function registerMessage(code: string | undefined): string | undefined {
  return code === undefined
    ? undefined
    : registerSentences[code as RepoPathError | "central-inventory"];
}
