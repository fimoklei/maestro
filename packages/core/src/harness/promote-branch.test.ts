import { describe, expect, it } from "vitest";
import { promoteBranch, promoteCompareUrl } from "./promote-branch";

const origin = { host: "github.com", ownerRepo: "fimoklei/agent-harness" };

describe("promoteBranch", () => {
  it("names the branch after the skill it carries", () => {
    expect(promoteBranch("tdd")).toBe("maestro/tdd");
  });
});

describe("promoteCompareUrl", () => {
  it("opens GitHub's pull-request form from the default branch to the promote branch", () => {
    expect(promoteCompareUrl(origin, "main", "tdd")).toBe(
      "https://github.com/fimoklei/agent-harness/compare/main...maestro/tdd?expand=1",
    );
  });

  it("escapes a default branch whose name carries a url character", () => {
    expect(promoteCompareUrl(origin, "release/2.0 rc", "tdd")).toBe(
      "https://github.com/fimoklei/agent-harness/compare/release%2F2.0%20rc...maestro/tdd?expand=1",
    );
  });
});
