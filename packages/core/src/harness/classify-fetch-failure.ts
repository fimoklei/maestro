import { normalizeCommandOutput } from "../normalize-command-output";

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
