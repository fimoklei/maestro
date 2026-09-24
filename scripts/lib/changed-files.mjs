// The uncommitted work `pnpm test:affected` hands to `vitest related`.

import { execFileSync } from "node:child_process";

/**
 * Lists every file that differs from HEAD in the working tree, plus untracked
 * files, relative to the repository root that `cwd` names. Deleted and
 * ignored files are left out.
 */
export function changedFiles(cwd) {
  const git = (args) =>
    execFileSync("git", args, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .split("\0")
      .filter(Boolean);

  return [
    ...git(["diff", "HEAD", "--name-only", "--diff-filter=d", "-z"]),
    ...git(["ls-files", "--others", "--exclude-standard", "-z"]),
  ];
}
