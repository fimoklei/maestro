import { describe, expect, it } from "vitest";
import {
  describeOtherStacks,
  otherWorktreeStacks,
} from "../../scripts/dev-stacks.mjs";

const SELF = "/repo/main";
const SIBLING = "/repo/main/.claude/worktrees/a";
const OTHER = "/repo/main/.claude/worktrees/b";

function stacks(
  pids: Record<string, number | null>,
  owner: Record<number, string | null>,
) {
  return otherWorktreeStacks({
    self: SELF,
    worktrees: [SELF, SIBLING, OTHER],
    readPid: (worktree) => pids[worktree] ?? null,
    worktreeOf: (pid) => owner[pid] ?? null,
  });
}

describe("otherWorktreeStacks", () => {
  it("names each other worktree whose launcher still runs there", () => {
    expect(
      stacks(
        { [SELF]: 10, [SIBLING]: 20, [OTHER]: 30 },
        { 10: SELF, 20: SIBLING, 30: OTHER },
      ),
    ).toEqual([
      { worktree: SIBLING, pid: 20 },
      { worktree: OTHER, pid: 30 },
    ]);
  });

  it("skips a pidfile whose pid is gone or now runs elsewhere", () => {
    expect(
      stacks({ [SIBLING]: 20, [OTHER]: 30 }, { 20: null, 30: "/elsewhere" }),
    ).toEqual([]);
  });

  it("finds nothing when git could not list the worktrees", () => {
    expect(
      otherWorktreeStacks({
        self: SELF,
        worktrees: null,
        readPid: () => 20,
        worktreeOf: () => SIBLING,
      }),
    ).toEqual([]);
  });
});

describe("describeOtherStacks", () => {
  it("says nothing when no other stack runs", () => {
    expect(describeOtherStacks([])).toBeNull();
  });

  it("names each stack and the command that stops it", () => {
    const warning = describeOtherStacks([{ worktree: SIBLING, pid: 20 }]);
    expect(warning).toContain(`${SIBLING} (pid 20)`);
    expect(warning).toContain(`pnpm -C ${SIBLING} smoke:stop`);
  });
});
