import { type ExecFileOptions, execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

type GitOptions = Pick<ExecFileOptions, "env" | "timeout">;

// Trimmed stdout, or the exit code for a caller that tells failures apart
// (null where git never exited: missing binary, timeout).
export type GitRun =
  | { ok: true; stdout: string }
  | { ok: false; exitCode: number | null };

export async function runGit(
  root: string,
  args: string[],
  options?: GitOptions,
): Promise<GitRun> {
  try {
    const command = ["-C", root, ...args];
    const { stdout } = await (options === undefined
      ? run("git", command)
      : run("git", command, options));
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return { ok: false, exitCode: typeof code === "number" ? code : null };
  }
}

// Empty output or any failure means unknown. Callers keep their existing
// invocation policy: local reads have no options; scaffold reads are bounded.
export async function runGitText(
  root: string,
  args: string[],
  options?: GitOptions,
): Promise<string | null> {
  const result = await runGit(root, args, options);
  return result.ok && result.stdout.length > 0 ? result.stdout : null;
}
