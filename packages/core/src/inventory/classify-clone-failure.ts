import { normalizeCommandOutput } from "../normalize-command-output";

// Only the class crosses into a response, never the text. The phrases assume
// git's fixed `LC_ALL=C` locale.
const AUTH_PHRASES = [
  "could not read username",
  "could not read password",
  "terminal prompts disabled",
  "authentication failed",
  "permission denied (publickey)",
  "invalid username or token",
];

// GitHub answers private, missing and mistyped repositories identically.
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
  const normalized = normalizeCommandOutput(stderr);
  if (AUTH_PHRASES.some((phrase) => normalized.includes(phrase))) {
    return "clone-auth-failed";
  }
  // Unrecognised is a plain failure: blaming the URL would mislead.
  return UNAVAILABLE_PHRASES.some((phrase) => normalized.includes(phrase))
    ? "clone-unavailable"
    : "clone-failed";
};
