import {
  type ProcessOptions,
  type ProcessOutcome,
  runProcess,
} from "../process/run-process";
import { gitOptions } from "./non-interactive";

export type GitRun =
  | { ok: true; stdout: string }
  | { ok: false; exitCode: number | null };

export function runGitProcess(
  root: string,
  args: string[],
  options: ProcessOptions = gitOptions(),
): Promise<ProcessOutcome> {
  return runProcess("git", ["-C", root, ...args], options);
}

export async function runGit(root: string, args: string[]): Promise<GitRun> {
  const outcome = await runGitProcess(root, args);
  if (outcome.ok) {
    return { ok: true, stdout: outcome.stdout.trim() };
  }
  return {
    ok: false,
    exitCode: outcome.failure === "failed" ? outcome.exitCode : null,
  };
}

export async function runGitText(
  root: string,
  args: string[],
): Promise<string | null> {
  const result = await runGit(root, args);
  return result.ok && result.stdout.length > 0 ? result.stdout : null;
}
