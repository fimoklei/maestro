import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import {
  DESELECT_DELETED,
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

  it("names the next step after the proposed items and the blocked press", () => {
    expect(PROPOSED_NOTE).toBe(
      "Review and merge each pull request on GitHub. Then select Create a release.",
    );
    expect(DESELECT_DELETED).toBe("Deselect the deleted items.");
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
