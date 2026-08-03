import { describe, expect, it } from "vitest";
import { diffSkillTrees } from "./skill-movements";

describe("diffSkillTrees", () => {
  it("reads a skill only the default branch carries as added", () => {
    expect(
      diffSkillTrees(
        [{ name: "tdd", treeHash: "t1" }],
        [
          { name: "tdd", treeHash: "t1" },
          { name: "grilling", treeHash: "g1" },
        ],
      ),
    ).toEqual([{ kind: "added", name: "grilling" }]);
  });

  it("reads a skill whose content moved as changed, not as a rewrite", () => {
    expect(
      diffSkillTrees(
        [{ name: "tdd", treeHash: "t1" }],
        [{ name: "tdd", treeHash: "t2" }],
      ),
    ).toEqual([{ kind: "changed", name: "tdd" }]);
  });

  it("reads a skill the release carried and the branch dropped as removed", () => {
    expect(diffSkillTrees([{ name: "tdd", treeHash: "t1" }], [])).toEqual([
      { kind: "removed", name: "tdd" },
    ]);
  });

  it("reads one directory's content under a new name as a rename", () => {
    // Untouched content under a new name is one movement, not a removal and an
    // addition the author has to pair up by eye.
    expect(
      diffSkillTrees(
        [{ name: "tdd", treeHash: "t1" }],
        [{ name: "test-first", treeHash: "t1" }],
      ),
    ).toEqual([{ kind: "renamed", name: "test-first", previousName: "tdd" }]);
  });

  it("leaves a harness whose skills all match the release with no movements", () => {
    expect(
      diffSkillTrees(
        [{ name: "tdd", treeHash: "t1" }],
        [{ name: "tdd", treeHash: "t1" }],
      ),
    ).toEqual([]);
  });

  it("reads every skill of a never-released harness as its first-release delta", () => {
    expect(
      diffSkillTrees(
        [],
        [
          { name: "tdd", treeHash: "t1" },
          { name: "grilling", treeHash: "g1" },
        ],
      ),
    ).toEqual([
      { kind: "added", name: "grilling" },
      { kind: "added", name: "tdd" },
    ]);
  });

  it("pairs a rename with the one match, leaving a second copy as an addition", () => {
    // Duplicated content is ordinary: a copied skill must not silently consume
    // the removal that belongs to the renamed one.
    expect(
      diffSkillTrees(
        [{ name: "tdd", treeHash: "t1" }],
        [
          { name: "alpha", treeHash: "t1" },
          { name: "beta", treeHash: "t1" },
        ],
      ),
    ).toEqual([
      { kind: "renamed", name: "alpha", previousName: "tdd" },
      { kind: "added", name: "beta" },
    ]);
  });
});
