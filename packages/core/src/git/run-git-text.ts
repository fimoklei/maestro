import { type ExecFileOptions, execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// Empty output or any failure means unknown (null).
export async function runGitText(
  root: string,
  args: string[],
  options?: Pick<ExecFileOptions, "env" | "timeout">,
): Promise<string | null> {
  try {
    const command = ["-C", root, ...args];
    const { stdout } = await (options === undefined
      ? run("git", command)
      : run("git", command, options));
    const output = stdout.trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}
