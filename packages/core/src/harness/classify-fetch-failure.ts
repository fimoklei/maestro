import { normalizeCommandOutput } from "../normalize-command-output";

// Turns git's failure text into one of Maestro's two no-answer classes. The
// text is read here and thrown away: nothing derived from it but the class
// crosses into a response (security.md).

// No answer arrived at all. Anything else — including a rejected key — is a
// reply, and stays an ordinary failed fetch: whether GitHub lets this user in
// is GitHub's answer to give, not a gate Maestro invents (ADR-0021).
const OFFLINE_PHRASES = [
  "could not resolve host",
  "could not resolve proxy",
  "temporary failure in name resolution",
  "failed to connect to",
  "network is unreachable",
  "no route to host",
  "connection timed out",
  "operation timed out",
];

export const classifyFetchFailure = (
  stderr: string,
): "offline" | "fetch-failed" => {
  const normalized = normalizeCommandOutput(stderr);
  return OFFLINE_PHRASES.some((phrase) => normalized.includes(phrase))
    ? "offline"
    : "fetch-failed";
};
