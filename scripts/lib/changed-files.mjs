// The work `pnpm test:affected` hands to `vitest related`.

import { execFileSync } from "node:child_process";

/**
 * Lists every file that differs in the working tree, plus untracked files,
 * relative to the repository root that `cwd` names. With `since` null the
 * base is HEAD; with a ref it is that ref's merge base with HEAD, so work
 * already committed or merged on the branch counts too. Deleted and ignored
 * files are left out.
 */
export function changedFiles(cwd, since) {
  const git = (args) =>
    execFileSync("git", args, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .split("\0")
      .filter(Boolean);

  const base = since === null ? ["HEAD"] : ["--merge-base", since];
  return [
    ...git(["diff", ...base, "--name-only", "--diff-filter=d", "-z"]),
    ...git(["ls-files", "--others", "--exclude-standard", "-z"]),
  ];
}
