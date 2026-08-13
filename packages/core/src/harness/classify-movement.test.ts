import { describe, expect, it } from "vitest";
import {
  classifyMovement,
  isConcurrentlyChanged,
  isLocalDeletion,
  type SkillTreeHashes,
} from "./classify-movement";

// A skill whose content is the same everywhere: the released, quiet case each
// test moves one hash away from. No promote branch carries it.
const SETTLED: SkillTreeHashes = {
  remote: "same",
  promote: null,
  local: "same",
  working: "same",
};

/** A promote branch that exists and carries `tree` — absent when null. */
const branch = (tree: string | null) => ({ tree });

describe("classifyMovement", () => {
  it("reads a skill that is the same everywhere as nothing pending", () => {
    expect(classifyMovement(SETTLED)).toBeNull();
  });

  it("reads a promote branch the default branch does not carry as pending review", () => {
    expect(classifyMovement({ ...SETTLED, promote: branch("pushed") })).toBe(
      "pending-review",
    );
  });

  it("stops calling a merged promote branch pending review", () => {
    // The branch content reached origin/HEAD, so the review is over even though
    // nobody deleted the branch.
    expect(
      classifyMovement({ ...SETTLED, promote: branch("same") }),
    ).toBeNull();
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
        promote: branch("pushed"),
        local: "same",
        working: "edited",
      }),
    ).toBe("pending-review");
  });

  it("tests origin/HEAD before the promote branch", () => {
    // The branch's content reached origin/HEAD while this clone stayed behind.
    // Reading the branch first would call the merged work a review still open.
    expect(
      classifyMovement({
        remote: "newer",
        promote: branch("newer"),
        local: "older",
        working: "older",
      }),
    ).toBeNull();
  });

  it("reads a promote branch that removes the skill as pending review", () => {
    // Deleting a skill is a proposal like any other, and it is exactly the
    // branch that carries no tree to hash.
    expect(classifyMovement({ ...SETTLED, promote: branch(null) })).toBe(
      "pending-review",
    );
  });

  it("keeps a branch that removes a skill the harness never had quiet", () => {
    expect(
      classifyMovement({
        remote: null,
        promote: branch(null),
        local: null,
        working: null,
      }),
    ).toBeNull();
  });
});

describe("isLocalDeletion", () => {
  it("reads a skill present at local HEAD and gone from disk as a deletion", () => {
    expect(isLocalDeletion({ ...SETTLED, working: null })).toBe(true);
  });

  it("reads a skill added on disk as no deletion", () => {
    expect(
      isLocalDeletion({
        remote: null,
        promote: null,
        local: null,
        working: "new",
      }),
    ).toBe(false);
  });

  it("reads an edited skill as no deletion", () => {
    expect(isLocalDeletion({ ...SETTLED, working: "edited" })).toBe(false);
  });

  it("never reads a skill this clone has not pulled yet as a deletion", () => {
    // Present on the remote, absent locally and at local HEAD: a clone that is
    // behind, never the author's own deletion (#575).
    expect(
      isLocalDeletion({
        remote: "newer",
        promote: null,
        local: null,
        working: null,
      }),
    ).toBe(false);
  });

  it("reads a settled skill as no deletion", () => {
    expect(isLocalDeletion(SETTLED)).toBe(false);
  });
});

describe("isConcurrentlyChanged", () => {
  it("reads a skill unchanged everywhere as no concurrent change", () => {
    expect(isConcurrentlyChanged(SETTLED)).toBe(false);
  });

  it("reads a local edit alone, with nothing new on the remote, as no concurrent change", () => {
    expect(isConcurrentlyChanged({ ...SETTLED, working: "edited" })).toBe(
      false,
    );
  });

  it("reads origin/HEAD moving past local HEAD as a concurrent change", () => {
    expect(isConcurrentlyChanged({ ...SETTLED, remote: "newer" })).toBe(true);
  });

  it("never reads an unmerged promote branch alone as a concurrent change", () => {
    // A branch differing from origin/HEAD is exactly what classifyMovement
    // itself reads as pending-review — the author's own unreviewed promotion
    // included. Flagging it here would relabel that as a teammate's change.
    expect(
      isConcurrentlyChanged({ ...SETTLED, promote: branch("newer") }),
    ).toBe(false);
  });

  it("never reads a promote branch proposing a deletion as a concurrent change on its own", () => {
    expect(isConcurrentlyChanged({ ...SETTLED, promote: branch(null) })).toBe(
      false,
    );
  });

  it("reads origin/HEAD as moved past local HEAD even on a clone that is only behind", () => {
    // The content fact alone does not know whether this row is promotable —
    // that gate is classifyMovement's, applied by the caller before this
    // answer is shown as #579's warning.
    expect(
      isConcurrentlyChanged({
        remote: "newer",
        promote: null,
        local: "older",
        working: "older",
      }),
    ).toBe(true);
  });

  it("reads a skill this clone has not pulled yet as a concurrent change once it is edited locally", () => {
    expect(
      isConcurrentlyChanged({
        remote: "newer",
        promote: null,
        local: null,
        working: "new",
      }),
    ).toBe(true);
  });

  it("never reads the author's own unpushed commit as a teammate's change", () => {
    // remote differs from local HEAD here only because local is ahead, not
    // behind — local HEAD already carries everything origin/HEAD has, so the
    // difference is this author's own unpushed commit (#579's false positive).
    expect(
      isConcurrentlyChanged(
        { remote: "old", promote: null, local: "mine", working: "mine" },
        true,
      ),
    ).toBe(false);
  });

  it("still reads a real divergence as a concurrent change when local does not include remote", () => {
    expect(isConcurrentlyChanged({ ...SETTLED, remote: "newer" }, false)).toBe(
      true,
    );
  });
});
