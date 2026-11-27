import type { ProcessFailure } from "../process/run-process";

export const classifyGitError = <T>(
  failure: ProcessFailure,
  classify: (stderr: string) => T,
): "offline" | T =>
  failure.failure === "killed" ? "offline" : classify(failure.stderr);
