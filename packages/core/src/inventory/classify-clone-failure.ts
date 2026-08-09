// Turns a failed `git clone` into one of Maestro's three classes. The text is
// read here and thrown away: nothing derived from it but the class crosses
// into a response (security.md). Git runs under a fixed locale, so the phrases
// below are the ones it prints (`non-interactive.ts`).

// Git proving it had no credentials to offer, or that the ones it offered were
// refused.
const AUTH_PHRASES = [
  "could not read username",
  "could not read password",
  "terminal prompts disabled",
  "authentication failed",
  "permission denied (publickey)",
  "invalid username or token",
];

// The remote answering that there is no repository there for you. GitHub
// answers a private, a missing and a mistyped one identically, so telling
// those apart would be a guess (#555).
const UNAVAILABLE_PHRASES = [
  "repository not found",
  "does not appear to be a git repository",
  "does not exist",
];

export type CloneFailure =
  | "clone-auth-failed"
  | "clone-unavailable"
  | "clone-failed";

export const classifyCloneFailure = (stderr: string): CloneFailure => {
  const normalized = stderr.toLowerCase().replace(/\s+/g, " ");
  if (AUTH_PHRASES.some((phrase) => normalized.includes(phrase))) {
    return "clone-auth-failed";
  }
  // Anything unrecognised is a failure and nothing more. Naming the repository
  // for a full disk, a dropped connection or an unwritable folder sends the
  // user to check a URL that was never the problem.
  return UNAVAILABLE_PHRASES.some((phrase) => normalized.includes(phrase))
    ? "clone-unavailable"
    : "clone-failed";
};
