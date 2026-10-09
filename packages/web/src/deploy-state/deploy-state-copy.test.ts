import { describe, expect, it } from "vitest";
import { plainText } from "../ui/phrase";
import {
  deployStateNotRead,
  localEditsLine,
  localEditsReason,
  NO_FILTER_MATCH,
  NO_LONGER_RELEASED_HINT,
  NO_REPOSITORIES,
  NO_TOOL_DETECTED,
  NOTHING_DEPLOYED,
  ORIGIN_NOT_READ,
  otherOriginLine,
  REPO_NOT_READ,
  REPO_NOT_READ_LINE,
  REREAD_LABEL,
  TARGET_LABEL,
  targetCount,
  UNREACHED_HINT,
  VIEW_REPOSITORY_ON_GITHUB,
  VIEW_SKILL_ON_GITHUB,
} from "./deploy-state-copy";

// Approved sentences, as exact strings.
describe("Deploy-state copy", () => {
  // #1123: a row is a Target; the column, its split and the pane's fact say so.
  it("names a target Target wherever the screen labels one", () => {
    expect(TARGET_LABEL).toBe("Target");
  });

  it("names the screen's one re-read control in every failed read", () => {
    expect(REREAD_LABEL).toBe("Re-read Deploy-state");
    expect(REPO_NOT_READ).toBe("Deploy-state not read");
    expect(REPO_NOT_READ_LINE).toBe(
      "Deploy-state not read. Select Re-read Deploy-state to read this repository's deploy-state again.",
    );
  });

  // #1393: the band's failed reads share one action, so they are one notice.
  it("merges the band's failed reads into one notice that names each part", () => {
    const notice = {
      level: "error",
      label: "Deploy-state not read",
      message: "Select Re-read Deploy-state to read every target again.",
    };
    expect(deployStateNotRead(["global"])).toEqual({
      ...notice,
      detail: "Not read: global targets.",
    });
    expect(deployStateNotRead(["repos"])).toEqual({
      ...notice,
      detail: "Not read: registered repositories.",
    });
    expect(deployStateNotRead(["global", "repos"])).toEqual({
      ...notice,
      detail: "Not read: global targets and registered repositories.",
    });
  });

  it("keeps the approved empty and zero-tool sentences", () => {
    expect(NOTHING_DEPLOYED).toBe("Nothing deployed yet");
    expect(NO_TOOL_DETECTED).toBe(
      "Install Claude Code or Codex to deploy skills globally.",
    );
    expect(NO_REPOSITORIES).toBe(
      "No repositories registered yet. Select Register repository on the Repositories screen.",
    );
    expect(NO_FILTER_MATCH).toBe(
      "No targets match the filters. Select Filter to show more targets.",
    );
  });

  // #1180: the GitHub column's menu item and its Unknown badge's cause.
  it("keeps the GitHub column's sentences", () => {
    expect(VIEW_REPOSITORY_ON_GITHUB).toBe("View repository on GitHub");
    expect(ORIGIN_NOT_READ).toBe(
      "The origin of this repository could not be read. Select Re-read Deploy-state to read it again.",
    );
  });

  // #1181: a skill row's menu item and its Unknown badge's cause.
  it("keeps the skill sub-list's GitHub item", () => {
    expect(VIEW_SKILL_ON_GITHUB).toBe("View skill on GitHub");
  });

  it("counts targets for one and many", () => {
    expect(targetCount(1)).toBe("1 target");
    expect(targetCount(7)).toBe("7 targets");
  });

  it("names every other origin a target holds", () => {
    expect(plainText(otherOriginLine(["fimoklei/agent-harness"]))).toBe(
      "Holds skills, hooks and MCP servers deployed from fimoklei/agent-harness.",
    );
    expect(plainText(otherOriginLine(["a/b", "c/d"]))).toBe(
      "Holds skills, hooks and MCP servers deployed from a/b and c/d.",
    );
  });

  it("keeps the hints of the two drift marks", () => {
    expect(NO_LONGER_RELEASED_HINT).toBe("Not in the latest release.");
    expect(UNREACHED_HINT).toBe("Update check did not run.");
  });

  it("names every skill with local edits, the reason alone", () => {
    expect(plainText(localEditsReason(["tdd"]))).toBe(
      "1 skill has changes that are not in the latest release: tdd.",
    );
    expect(plainText(localEditsReason(["tdd", "review"]))).toBe(
      "2 skills have changes that are not in the latest release: tdd and review.",
    );
  });

  it("names every skill with local edits and how to keep them", () => {
    const keep = "Select Import local edits to keep them.";
    expect(plainText(localEditsLine(["tdd"], false))).toBe(
      `1 skill has changes that are not in the latest release: tdd. ${keep}`,
    );
    expect(plainText(localEditsLine(["tdd", "grill", "review"], false))).toBe(
      `3 skills have changes that are not in the latest release: tdd, grill and review. ${keep}`,
    );
    const long = "write-a-very-long-skill-name-that-keeps-going-on-and-on";
    expect(plainText(localEditsLine([long, "tdd"], false))).toBe(
      `2 skills have changes that are not in the latest release: ${long} and tdd. ${keep}`,
    );
  });

  it("advises importing local edits before a behind target updates", () => {
    expect(plainText(localEditsLine(["tdd", "review"], true))).toBe(
      "2 skills have changes that are not in the latest release: tdd and review. To keep them, select Import local edits before you update.",
    );
  });
});
