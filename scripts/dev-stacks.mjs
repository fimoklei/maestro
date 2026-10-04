// Which worktrees of this repo still run a `pnpm dev` or `pnpm smoke` stack.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { processWorktree } from "./port-holders.mjs";

/** The launcher's note, in each worktree's root: the pid of its process group. */
export const PID_FILE = ".maestro-dev.pid";

/** The pid a worktree's pidfile names; null when it holds none. */
function readStackPid(worktree) {
  try {
    const pid = Number(readFileSync(join(worktree, PID_FILE), "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Every other worktree whose pidfile names a live process in that worktree.
 * A pid now running elsewhere is a stale note, not a stack.
 */
export function otherWorktreeStacks({
  self,
  worktrees,
  readPid = readStackPid,
  worktreeOf = (pid) => processWorktree(pid, { worktrees }),
}) {
  if (worktrees === null) return [];

  return worktrees
    .filter((worktree) => worktree !== self)
    .map((worktree) => ({ worktree, pid: readPid(worktree) }))
    .filter(
      ({ worktree, pid }) => pid !== null && worktreeOf(pid) === worktree,
    );
}

export function describeOtherStacks(stacks) {
  if (stacks.length === 0) return null;

  return [
    "Warning: dev or smoke stacks from other worktrees are running and slow the tests:",
    ...stacks.map(
      ({ worktree, pid }) =>
        `  ${worktree} (pid ${pid}) — stop it: pnpm -C ${worktree} smoke:stop`,
    ),
  ].join("\n");
}
