import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { plainText } from "../ui/phrase";
import {
  deletionsKept,
  deletionsSentence,
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
    expect(proposeBatchHeading(1, 1)).toBe("Proposed 1 of 1 change");
    expect(proposeBatchHeading(0, 9)).toBe("Proposed 0 of 9 changes");
    expect(proposeBatchHeading(7, 9)).toBe("Proposed 7 of 9 changes");
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
      "The Prompts screen keeps the prompts until the next release.",
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
