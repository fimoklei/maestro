import { runProcess } from "../process/run-process";
import type { RunHelper } from "./folder-chooser-port";

export const runHelper: RunHelper = async (file, args, options) => {
  const outcome = await runProcess(file, args, {
    ...options,
    maxBuffer: 64 * 1024,
  });
  if (outcome.ok) {
    return {
      exitCode: 0,
      killed: false,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
    };
  }
  return {
    exitCode: outcome.failure === "failed" ? outcome.exitCode : null,
    killed: outcome.failure === "killed",
    stdout: outcome.stdout,
    stderr: outcome.stderr,
  };
};
