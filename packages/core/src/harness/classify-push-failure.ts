import { normalizeCommandOutput } from "../normalize-command-output";
import { classifyFetchFailure } from "./classify-fetch-failure";

export const classifyPushFailure = (
  stderr: string,
): "already-exists" | "stale-tip" | "refused" | "offline" | "push-failed" => {
  if (classifyFetchFailure(stderr) === "offline") {
    return "offline";
  }
  const normalized = normalizeCommandOutput(stderr);
  if (normalized.includes("already exists")) {
    return "already-exists";
  }
  if (normalized.includes("[remote rejected]")) {
    return "refused";
  }
  return normalized.includes("stale info") ? "stale-tip" : "push-failed";
};
