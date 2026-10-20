import { describe, expect, it } from "vitest";
import { diffPrimitives } from "./harness-movements";

describe("diffPrimitives", () => {
  it("never reads a skill and a prompt with one name and one content as a rename", () => {
    expect(
      diffPrimitives(
        [{ type: "skill", name: "tdd", hash: "x1" }],
        [{ type: "prompt", name: "tdd", hash: "x1" }],
      ),
    ).toEqual([
      { type: "prompt", kind: "added", name: "tdd" },
      { type: "skill", kind: "removed", name: "tdd" },
    ]);
  });

  it("reads a rename within the prompts", () => {
    expect(
      diffPrimitives(
        [{ type: "prompt", name: "review", hash: "b1" }],
        [{ type: "prompt", name: "pr-review", hash: "b1" }],
      ),
    ).toEqual([
      {
        type: "prompt",
        kind: "renamed",
        name: "pr-review",
        previousName: "review",
      },
    ]);
  });

  it("reads a skill only the default branch carries as added", () => {
    expect(
      diffPrimitives(
        [{ type: "skill", name: "tdd", hash: "t1" }],
        [
          { type: "skill", name: "tdd", hash: "t1" },
          { type: "skill", name: "grilling", hash: "g1" },
        ],
      ),
    ).toEqual([{ type: "skill", kind: "added", name: "grilling" }]);
  });

  it("reads a skill whose content moved as changed, not as a rewrite", () => {
    expect(
      diffPrimitives(
        [{ type: "skill", name: "tdd", hash: "t1" }],
        [{ type: "skill", name: "tdd", hash: "t2" }],
      ),
    ).toEqual([{ type: "skill", kind: "changed", name: "tdd" }]);
  });

  it("reads a skill the release carried and the branch dropped as removed", () => {
    expect(
      diffPrimitives([{ type: "skill", name: "tdd", hash: "t1" }], []),
    ).toEqual([{ type: "skill", kind: "removed", name: "tdd" }]);
  });

  it("reads one directory's content under a new name as a rename", () => {
    expect(
      diffPrimitives(
        [{ type: "skill", name: "tdd", hash: "t1" }],
        [{ type: "skill", name: "test-first", hash: "t1" }],
      ),
    ).toEqual([
      {
        type: "skill",
        kind: "renamed",
        name: "test-first",
        previousName: "tdd",
      },
    ]);
  });

  it("leaves a harness whose skills all match the release with no movements", () => {
    expect(
      diffPrimitives(
        [{ type: "skill", name: "tdd", hash: "t1" }],
        [{ type: "skill", name: "tdd", hash: "t1" }],
      ),
    ).toEqual([]);
  });

  it("reads every skill of a never-released harness as its first-release delta", () => {
    expect(
      diffPrimitives(
        [],
        [
          { type: "skill", name: "tdd", hash: "t1" },
          { type: "skill", name: "grilling", hash: "g1" },
        ],
      ),
    ).toEqual([
      { type: "skill", kind: "added", name: "grilling" },
      { type: "skill", kind: "added", name: "tdd" },
    ]);
  });

  it("refuses to name a rename when two copies could equally be the one", () => {
    // Duplicated content points at both copies; picking either would be a guess.
    expect(
      diffPrimitives(
        [{ type: "skill", name: "tdd", hash: "t1" }],
        [
          { type: "skill", name: "alpha", hash: "t1" },
          { type: "skill", name: "beta", hash: "t1" },
        ],
      ),
    ).toEqual([
      { type: "skill", kind: "added", name: "alpha" },
      { type: "skill", kind: "added", name: "beta" },
      { type: "skill", kind: "removed", name: "tdd" },
    ]);
  });

  it("refuses a rename when two removals share the added skill's content", () => {
    expect(
      diffPrimitives(
        [
          { type: "skill", name: "tdd", hash: "t1" },
          { type: "skill", name: "grilling", hash: "t1" },
        ],
        [{ type: "skill", name: "test-first", hash: "t1" }],
      ),
    ).toEqual([
      { type: "skill", kind: "removed", name: "grilling" },
      { type: "skill", kind: "removed", name: "tdd" },
      { type: "skill", kind: "added", name: "test-first" },
    ]);
  });
});
