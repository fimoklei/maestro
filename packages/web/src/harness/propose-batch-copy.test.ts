import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { plainText } from "../ui/phrase";
import {
  deletionsKept,
  deletionsSentence,
  noGhNotice,
  notInNextReleaseNotice,
  PROPOSE_CHANGES,
  PROPOSED_NOTE,
  proposeBatchHeading,
  proposeBatchNotice,
  proposeBatchTitle,
} from "./propose-batch-copy";

// The approved Propose changes words, as exact strings.
describe("Propose changes copy", () => {
  it("counts one change and several", () => {
    expect(PROPOSE_CHANGES).toBe("Propose changes");
    expect(proposeBatchTitle(1)).toBe("Propose 1 change");
    expect(proposeBatchTitle(9)).toBe("Propose 9 changes");
    expect(proposeBatchHeading(1, 1, 1)).toBe("Proposed 1 of 1 change");
    expect(proposeBatchHeading(0, 0, 9)).toBe("Proposed 0 of 9 changes");
    expect(proposeBatchHeading(7, 9, 9)).toBe("Proposed 7 of 9 changes");
  });

  it("blocks a deletion that is not in the next release, for one and several", () => {
    const one = notInNextReleaseNotice(["old-deploy"]);
    expect(one.label).toBe("Not in the next release");
    expect(plainText(one.message)).toBe(
      "old-deploy is not in the next release, so there is nothing to delete. Select Close, then deselect it.",
    );
    expect(
      plainText(
        notInNextReleaseNotice(["old-deploy", "legacy-review"]).message,
      ),
    ).toBe(
      "old-deploy and legacy-review are not in the next release, so there is nothing to delete. Select Close, then deselect them.",
    );
  });

  it("states once that gh is missing, for one row and several", () => {
    const cause =
      "Maestro opens pull requests through gh, and gh is not available.";
    expect(noGhNotice(1)).toEqual({
      label: "Pull request not opened",
      message: "Select Create pull request on GitHub.",
      detail: cause,
    });
    expect(noGhNotice(9)).toEqual({
      label: "Pull requests not opened",
      message: "Select Create pull request on GitHub on each row.",
      detail: cause,
    });
  });

  it("says pushed, not proposed, when no pull request opened", () => {
    expect(proposeBatchHeading(0, 9, 9)).toBe("Pushed 9 of 9 changes");
  });

  it("names the next step after the proposed items", () => {
    expect(PROPOSED_NOTE).toBe(
      "Review and merge each pull request on GitHub. Then select Create a release.",
    );
  });

  it("says what the deletions delete, by count and kind", () => {
    const skill = { type: "skill" as const };
    const prompt = { type: "prompt" as const };
    const sentence = (deleted: { type: "skill" | "prompt" }[]) =>
      plainText(deletionsSentence(deleted, "fimoklei/harness"));
    expect(sentence([skill, skill])).toBe(
      "2 changes delete skills from fimoklei/harness when merged.",
    );
    expect(sentence([skill])).toBe(
      "1 change deletes a skill from fimoklei/harness when merged.",
    );
    expect(sentence([prompt])).toBe(
      "1 change deletes a prompt from fimoklei/harness when merged.",
    );
    expect(sentence([skill, prompt])).toBe(
      "2 changes delete skills and prompts from fimoklei/harness when merged.",
    );
  });

  it("says what keeps each deleted kind until the next release", () => {
    expect(deletionsKept(2, 0)).toEqual([
      "Your targets keep the skills. After the next release, select Update target on each target to remove them.",
    ]);
    expect(deletionsKept(1, 0)).toEqual([
      "Your targets keep the skill. After the next release, select Update target on each target to remove it.",
    ]);
    expect(deletionsKept(0, 2)).toEqual([
      "The prompts are kept until the next release.",
    ]);
    expect(deletionsKept(0, 1)).toEqual([
      "The prompt is kept until the next release.",
    ]);
    expect(deletionsKept(0, 0)).toEqual([]);
  });

  it("refuses a second batch with the batch's own control", () => {
    expect(
      proposeBatchNotice(
        new HttpError(409, "", "promote-in-progress", {
          error: "promote-in-progress",
        }),
      ),
    ).toMatchObject({
      label: "Harness busy",
      message:
        "Wait for that change to finish, then select Propose changes again.",
      detail: "Maestro proposes one change at a time.",
    });
  });
});
