import { describe, expect, it } from "vitest";
import {
  isConcurrentlyChanged,
  isLocalDeletion,
  type SkillTreeHashes,
} from "./classify-movement";

const SETTLED: SkillTreeHashes = {
  remote: "same",
  promote: null,
  local: "same",
  working: "same",
};

/** A promote branch that exists and carries `tree` — absent when null. */
const branch = (tree: string | null) => ({ tree });

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
    // A clone that is behind, never the author's own deletion (#575).
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
    // The review stage reads this as the author's own proposal, not a teammate's.
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
    // Local is ahead, not behind: the author's own unpushed commit (#579).
    expect(
      isConcurrentlyChanged(
        { remote: "old", promote: null, local: "mine", working: "mine" },
        "old",
      ),
    ).toBe(false);
  });

  it("still reads a real divergence as a concurrent change when the merge base does not match remote", () => {
    expect(isConcurrentlyChanged({ ...SETTLED, remote: "newer" }, "same")).toBe(
      true,
    );
  });

  it("never lets an unrelated commit on origin/HEAD block a different skill's promotion", () => {
    // origin/HEAD never moved this skill; a teammate changed another (#579).
    expect(
      isConcurrentlyChanged(
        { remote: "same", promote: null, local: "mine", working: "mine" },
        "same",
      ),
    ).toBe(false);
  });

  it("falls back to the plain comparison when the merge base could not be read", () => {
    expect(
      isConcurrentlyChanged({ ...SETTLED, remote: "newer" }, undefined),
    ).toBe(true);
  });
});
