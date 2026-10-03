export const PID_FILE: string;

/** Null when the worktree's pidfile names no pid. */
export function readStackPid(worktree: string): number | null;

export interface RunningStack {
  worktree: string;
  pid: number;
}

export function otherWorktreeStacks(input: {
  self: string;
  /** Null when git could not list them: nothing is reported. */
  worktrees: string[] | null;
  readPid?: (worktree: string) => number | null;
  worktreeOf?: (pid: number) => string | null;
}): RunningStack[];

/** Null when no other stack runs. */
export function describeOtherStacks(stacks: RunningStack[]): string | null;
