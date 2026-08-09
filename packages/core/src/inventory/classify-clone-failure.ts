// Turns a failed `git clone` into one of Maestro's two classes. The text is
// read here and thrown away: nothing derived from it but the class crosses
// into a response (security.md).

// Git proving it had no credentials to offer, or that the ones it offered were
// refused. Everything else stays unavailable: GitHub answers a private, a
// missing and a mistyped repository identically, so telling them apart would
// be a guess (#555).
const AUTH_PHRASES = [
  "could not read username",
  "could not read password",
  "terminal prompts disabled",
  "authentication failed",
  "permission denied (publickey)",
  "invalid username or token",
];

export type CloneFailure = "clone-auth-failed" | "clone-unavailable";

export const classifyCloneFailure = (stderr: string): CloneFailure => {
  const normalized = stderr.toLowerCase().replace(/\s+/g, " ");
  return AUTH_PHRASES.some((phrase) => normalized.includes(phrase))
    ? "clone-auth-failed"
    : "clone-unavailable";
};
