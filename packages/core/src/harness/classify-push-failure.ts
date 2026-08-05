// Turns a rejected `git push` of a tag into one of Maestro's three classes.
// The text is read here and thrown away: nothing derived from it but the
// class crosses into a response (security.md).
import { classifyFetchFailure } from "./classify-fetch-failure";

export const classifyPushFailure = (
  stderr: string,
): "already-exists" | "stale-tip" | "offline" | "push-failed" => {
  if (classifyFetchFailure(stderr) === "offline") {
    return "offline";
  }
  const normalized = stderr.toLowerCase().replace(/\s+/g, " ");
  if (normalized.includes("already exists")) {
    return "already-exists";
  }
  // The lease git refused: the default branch is no longer where the plan read
  // it. `--atomic` means the tag was refused with it (#520).
  return normalized.includes("stale info") ? "stale-tip" : "push-failed";
};
