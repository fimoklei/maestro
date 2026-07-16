// Shared test fixture: turns a directory into a real git repo, optionally with
// an origin remote. Connect requires a parseable git origin (#147), so suites
// that build a connectable clone need this — offline throughout: the remote
// URL is never fetched.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const FIXTURE_ORIGIN_URL = "git@github.com:fimoklei/agent-harness.git";

export async function initGitClone(
  root: string,
  options?: { origin?: boolean },
): Promise<void> {
  await run("git", ["init"], { cwd: root });
  if (options?.origin !== false) {
    await run("git", ["remote", "add", "origin", FIXTURE_ORIGIN_URL], {
      cwd: root,
    });
  }
}
