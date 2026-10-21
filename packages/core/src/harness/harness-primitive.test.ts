import { describe, expect, it } from "vitest";
import {
  parsePrimitiveListing,
  parseProposalBranch,
  primitivePath,
  proposalBranch,
  proposalCompareUrl,
} from "./harness-primitive";

const origin = { host: "github.com", ownerRepo: "fimoklei/agent-harness" };

const entry = (mode: string, object: string, hash: string, name: string) =>
  `${mode} ${object} ${hash}\t${name}\0`;

describe("primitivePath", () => {
  it("places a skill as a folder and a prompt as one markdown file", () => {
    expect(primitivePath({ type: "skill", name: "tdd" })).toBe(
      ".apm/skills/tdd",
    );
    expect(primitivePath({ type: "prompt", name: "pr-review" })).toBe(
      ".maestro/prompts/pr-review.md",
    );
  });
});

describe("proposalBranch", () => {
  it("names the branch after the skill it carries", () => {
    expect(proposalBranch({ type: "skill", name: "tdd" })).toBe("maestro/tdd");
  });

  it("gives a prompt its own branch family, so it never shares a skill's branch", () => {
    expect(proposalBranch({ type: "prompt", name: "tdd" })).toBe(
      "maestro/prompt.tdd",
    );
  });
});

describe("parseProposalBranch", () => {
  it("reads a plain branch as a skill and a prompt-family branch as a prompt", () => {
    expect(parseProposalBranch("tdd")).toEqual({ type: "skill", name: "tdd" });
    expect(parseProposalBranch("prompt.tdd")).toEqual({
      type: "prompt",
      name: "tdd",
    });
  });

  it("skips any other dotted branch", () => {
    expect(parseProposalBranch("release.2")).toBeNull();
    expect(parseProposalBranch("prompt.")).toBeNull();
  });
});

describe("proposalCompareUrl", () => {
  it("opens GitHub's pull-request form from the default branch to the proposal branch", () => {
    expect(
      proposalCompareUrl(origin, "main", { type: "skill", name: "tdd" }),
    ).toBe(
      "https://github.com/fimoklei/agent-harness/compare/main...maestro/tdd?expand=1",
    );
    expect(
      proposalCompareUrl(origin, "main", { type: "prompt", name: "tdd" }),
    ).toBe(
      "https://github.com/fimoklei/agent-harness/compare/main...maestro/prompt.tdd?expand=1",
    );
  });

  it("escapes a default branch whose name carries a url character", () => {
    expect(
      proposalCompareUrl(origin, "release/2.0 rc", {
        type: "skill",
        name: "tdd",
      }),
    ).toBe(
      "https://github.com/fimoklei/agent-harness/compare/release%2F2.0%20rc...maestro/tdd?expand=1",
    );
  });
});

describe("parsePrimitiveListing", () => {
  it("lists every folder in the skills folder as a skill", () => {
    expect(
      parsePrimitiveListing(
        "skill",
        entry("040000", "tree", "t1", "tdd") +
          entry("100644", "blob", "b1", "README.md"),
      ),
    ).toEqual([{ type: "skill", name: "tdd", hash: "t1" }]);
  });

  it("lists only markdown files as prompts, named without the extension", () => {
    expect(
      parsePrimitiveListing(
        "prompt",
        entry("100644", "blob", "b1", "pr-review.md") +
          entry("100755", "blob", "b2", "run.md") +
          entry("100644", "blob", "b3", "notes.txt") +
          entry("120000", "blob", "b4", "linked.md") +
          entry("040000", "tree", "t1", "nested.md"),
      ),
    ).toEqual([
      { type: "prompt", name: "pr-review", hash: "b1" },
      { type: "prompt", name: "run", hash: "b2" },
    ]);
  });

  it("keeps a badly named prompt, so a listing never filters on validity", () => {
    expect(
      parsePrimitiveListing(
        "prompt",
        entry("100644", "blob", "b1", "PR Review.md"),
      ),
    ).toEqual([{ type: "prompt", name: "PR Review", hash: "b1" }]);
  });

  it("refuses a listing it does not recognise", () => {
    expect(parsePrimitiveListing("prompt", "garbage\0")).toBeNull();
  });
});
