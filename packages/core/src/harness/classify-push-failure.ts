import { normalizeCommandOutput } from "../normalize-command-output";
// Only the class leaves this file, never git's text.
import { classifyFetchFailure } from "./classify-fetch-failure";

export const classifyPushFailure = (
  stderr: string,
): "already-exists" | "stale-tip" | "offline" | "push-failed" => {
  if (classifyFetchFailure(stderr) === "offline") {
    return "offline";
  }
  const normalized = normalizeCommandOutput(stderr);
  if (normalized.includes("already exists")) {
    return "already-exists";
  }
  // The lease refused; `--atomic` refused the tag with it (#520).
  return normalized.includes("stale info") ? "stale-tip" : "push-failed";
};
