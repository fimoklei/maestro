import { describe, expect, it } from "vitest";
import { classifyMovement, type SkillTreeHashes } from "./classify-movement";

// A skill whose content is the same everywhere: the released, quiet case each
// test moves one hash away from.
const SETTLED: SkillTreeHashes = {
  remote: "same",
  promote: null,
  local: "same",
  working: "same",
};

describe("classifyMovement", () => {
  it("reads a skill that is the same everywhere as nothing pending", () => {
    expect(classifyMovement(SETTLED)).toBeNull();
  });

  it("reads a promote branch the default branch does not carry as pending review", () => {
    expect(classifyMovement({ ...SETTLED, promote: "pushed" })).toBe(
      "pending-review",
    );
  });

  it("stops calling a merged promote branch pending review", () => {
    // The branch content reached origin/HEAD, so the review is over even though
    // nobody deleted the branch.
    expect(classifyMovement({ ...SETTLED, promote: "same" })).toBeNull();
  });

  it("reads edited working content as pending promotion", () => {
    expect(classifyMovement({ ...SETTLED, working: "edited" })).toBe(
      "pending-promotion",
    );
  });

  it("never presents a clone that is only behind as the author's own change", () => {
    // The remote moved and this clone did not. Its content differs from
    // origin/HEAD, but it is the teammate's change, not this author's.
    expect(
      classifyMovement({
        remote: "newer",
        promote: null,
        local: "older",
        working: "older",
      }),
    ).toBeNull();
  });

  it("never presents a skill this clone has not pulled yet as a deletion", () => {
    expect(
      classifyMovement({
        remote: "newer",
        promote: null,
        local: null,
        working: null,
      }),
    ).toBeNull();
  });

  it("reads a skill deleted on disk as pending promotion", () => {
    expect(classifyMovement({ ...SETTLED, working: null })).toBe(
      "pending-promotion",
    );
  });

  it("reads a skill added on disk as pending promotion", () => {
    expect(
      classifyMovement({
        remote: null,
        promote: null,
        local: null,
        working: "new",
      }),
    ).toBe("pending-promotion");
  });

  it("places a skill that is both pushed and edited in the further-along table", () => {
    // Each skill appears in at most one table (#518), and the promote branch is
    // the state closer to release.
    expect(
      classifyMovement({
        remote: "same",
        promote: "pushed",
        local: "same",
        working: "edited",
      }),
    ).toBe("pending-review");
  });

  it("tests origin/HEAD before the promote branch", () => {
    // A promote branch left behind on an older revision is not a review the
    // team is waiting on — it is a stale branch, and the merged content wins.
    expect(
      classifyMovement({
        remote: "newer",
        promote: "newer",
        local: "older",
        working: "older",
      }),
    ).toBeNull();
  });
});
