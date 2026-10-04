export const PID_FILE: string;

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
