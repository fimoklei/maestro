import { describe, expect, it } from "vitest";
import { parseProposalBranch } from "./harness-primitive";
import {
  subjectBranch,
  subjectBranchLeaf,
  subjectPath,
} from "./proposal-subject";

const CATEGORIES_SUBJECT = { type: "categories" } as const;

describe("ProposalSubject", () => {
  it("places the categories list in one file on its own proposal branch", () => {
    expect(subjectPath(CATEGORIES_SUBJECT)).toBe(".maestro/categories.yml");
    expect(subjectBranch(CATEGORIES_SUBJECT)).toBe("maestro/list.categories");
  });

  it("places a primitive where the primitive itself lives", () => {
    const prompt = { type: "prompt", name: "tdd" } as const;
    expect(subjectPath(prompt)).toBe(".maestro/prompts/tdd.md");
    expect(subjectBranch(prompt)).toBe("maestro/prompt.tdd");
  });

  it("names the categories branch so no skill or prompt read takes it", () => {
    expect(parseProposalBranch(subjectBranchLeaf(CATEGORIES_SUBJECT))).toBe(
      null,
    );
  });
});
