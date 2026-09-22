import { describe, expect, it } from "vitest";
import {
  GLOBAL_NOT_READ,
  NO_FILTER_MATCH,
  NO_LONGER_RELEASED_HINT,
  NO_TOOL_DETECTED,
  NOTHING_DEPLOYED,
  otherOriginLine,
  REPO_NOT_READ,
  REPOS_NOT_READ,
  REREAD_LABEL,
  targetCount,
  UNREACHED_HINT,
} from "./deploy-state-copy";

// Approved sentences, as exact strings (copy.md).
describe("Deploy-state copy", () => {
  it("names the screen's one re-read control in every failed read", () => {
    expect(REREAD_LABEL).toBe("Re-read Deploy-state");
    expect([GLOBAL_NOT_READ, REPOS_NOT_READ, REPO_NOT_READ]).toEqual([
      {
        level: "error",
        label: "Global targets not read",
        message:
          "Select Re-read Deploy-state to read the global targets again.",
      },
      {
        level: "error",
        label: "Registered repositories not read",
        message:
          "Select Re-read Deploy-state to read the registered repositories again.",
      },
      {
        level: "error",
        label: "Deploy-state not read",
        message:
          "Select Re-read Deploy-state to read this repository's deploy-state again.",
      },
    ]);
  });

  it("keeps the approved empty and zero-tool sentences", () => {
    expect(NOTHING_DEPLOYED).toBe(
      "Nothing deployed — deploy a skill from Inventory",
    );
    expect(NO_TOOL_DETECTED).toEqual({
      level: "info",
      label: "No supported tool detected",
      message: "Install Claude Code or Codex to deploy skills globally.",
    });
    expect(NO_FILTER_MATCH).toBe(
      "No targets match the filters. Select Filter to show more targets.",
    );
  });

  it("counts targets for one and many", () => {
    expect(targetCount(1)).toBe("1 target");
    expect(targetCount(7)).toBe("7 targets");
  });

  it("names every other origin a target holds", () => {
    expect(otherOriginLine(["fimoklei/agent-harness"])).toBe(
      "Holds primitives deployed from fimoklei/agent-harness.",
    );
    expect(otherOriginLine(["a/b", "c/d"])).toBe(
      "Holds primitives deployed from a/b and c/d.",
    );
  });

  it("keeps the hints of the two drift marks", () => {
    expect(NO_LONGER_RELEASED_HINT).toBe(
      "This deployed skill is absent from the latest release",
    );
    expect(UNREACHED_HINT).toBe(
      "Could not reach the Harness location to check for updates",
    );
  });
});
