import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitOptions } from "./non-interactive";

const run = promisify(execFile);

// exitCode is null where git never exited (missing binary, timeout).
export type GitRun =
  | { ok: true; stdout: string }
  | { ok: false; exitCode: number | null };

export async function runGit(root: string, args: string[]): Promise<GitRun> {
  try {
    const { stdout } = await run("git", ["-C", root, ...args], gitOptions());
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return { ok: false, exitCode: typeof code === "number" ? code : null };
  }
}

// Empty output or any failure means unknown (null).
export async function runGitText(
  root: string,
  args: string[],
): Promise<string | null> {
  const result = await runGit(root, args);
  return result.ok && result.stdout.length > 0 ? result.stdout : null;
}
