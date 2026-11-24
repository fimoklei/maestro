import { describe, expect, it } from "vitest";
import { plainText } from "../ui/phrase";
import { DELETION_COPY } from "./deletion-copy";

describe("the Delete dialog's words", () => {
  it("says the targets keep a deleted skill until each one is updated", () => {
    expect(plainText(DELETION_COPY.skill.keeps("tdd"))).toBe(
      "Your targets keep the skill. After the next release, select Update target for each target on the Deploy-state screen to remove it.",
    );
  });
});
