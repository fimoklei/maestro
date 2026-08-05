// Turns a rejected `git push` of a tag into one of Maestro's three classes.
// The text is read here and thrown away: nothing derived from it but the
// class crosses into a response (security.md).
import { classifyFetchFailure } from "./classify-fetch-failure";

export const classifyPushFailure = (
  stderr: string,
): "already-exists" | "offline" | "push-failed" => {
  if (classifyFetchFailure(stderr) === "offline") {
    return "offline";
  }
  const normalized = stderr.toLowerCase().replace(/\s+/g, " ");
  return normalized.includes("already exists")
    ? "already-exists"
    : "push-failed";
};
