import { describe, expect, it } from "vitest";
import { rereadLabel } from "../ui/control-labels";
import { plainText } from "../ui/phrase";
import {
  CHECKING_LOCAL_EDITS,
  deployStateNotRead,
  localEditsLine,
  NO_FILTER_MATCH,
  NO_LONGER_RELEASED_HINT,
  NO_REPOSITORIES,
  NO_TARGETS,
  NO_TOOL_DETECTED,
  notUpdatedLine,
  notWrittenNote,
  ORIGIN_NOT_READ,
  otherOriginLine,
  packageBehindNotice,
  REPO_NOT_READ,
  REPO_NOT_READ_LINE,
  readByLine,
  skillsMissingLine,
  TARGET_LABEL,
  TARGETS_FACT,
  TIMED_OUT_HINT,
  UNREACHED_HINT,
  VIEW_SKILL_ON_GITHUB,
} from "./deploy-state-copy";

// Approved sentences, as exact strings.
describe("Skills missing copy", () => {
  const line = (missing: number, deployed: number) =>
    plainText(skillsMissingLine("~/.agents/skills", missing, deployed));

  it("counts many missing skills and names the folder", () => {
    expect(line(2, 2)).toBe(
      "2 of 2 deployed skills are missing in ~/.agents/skills.",
    );
  });

  it("counts one missing skill and names the folder", () => {
    expect(line(1, 2)).toBe(
      "1 of 2 deployed skills is missing in ~/.agents/skills.",
    );
  });

  it("drops the count where Global deploys one skill", () => {
    expect(line(1, 1)).toBe(
      "The deployed skill is missing in ~/.agents/skills.",
    );
  });
});

describe("Not updated copy", () => {
  const AGENTS = "~/.agents/skills";
  const line = (copies: { name: string; stillAt: string | null }[]) =>
    plainText(notUpdatedLine(AGENTS, copies, "v2.0.0"));

  it("names the release one copy is still at", () => {
    expect(line([{ name: "code-review", stillAt: "v1.0.0" }])).toBe(
      "code-review in ~/.agents/skills is still at v1.0.0, but the Target release is v2.0.0.",
    );
  });

  it("names the one release many copies are still at", () => {
    expect(
      line([
        { name: "code-review", stillAt: "v1.0.0" },
        { name: "commit-message", stillAt: "v1.0.0" },
      ]),
    ).toBe(
      "2 skills in ~/.agents/skills are still at v1.0.0, but the Target release is v2.0.0.",
    );
  });

  it("says older releases where many copies are at different ones", () => {
    expect(
      line([
        { name: "code-review", stillAt: "v1.1.0" },
        { name: "commit-message", stillAt: "v1.0.0" },
      ]),
    ).toBe(
      "2 skills in ~/.agents/skills are still at older releases, but the Target release is v2.0.0.",
    );
  });

  it("names no version and never says older where no release matched", () => {
    expect(line([{ name: "code-review", stillAt: null }])).toBe(
      "code-review in ~/.agents/skills is not at the Target release v2.0.0.",
    );
    expect(
      line([
        { name: "code-review", stillAt: "v1.0.0" },
        { name: "commit-message", stillAt: null },
      ]),
    ).toBe(
      "2 skills in ~/.agents/skills are not at the Target release v2.0.0.",
    );
  });
});

describe("Deploy-state copy", () => {
  // #1123: a row is a Target; the column, its split and the pane's fact say so.
  it("names a target Target wherever the screen labels one", () => {
    expect(TARGET_LABEL).toBe("Target");
  });

  it("names the screen's one re-read control in every failed read", () => {
    expect(rereadLabel("Deploy-state")).toBe("Re-read Deploy-state");
    // A Status hover card sentence, so it ends in a full stop.
    expect(REPO_NOT_READ).toBe("Deploy-state not read.");
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
      detail: "Not read: Global.",
    });
    expect(deployStateNotRead(["repos"])).toEqual({
      ...notice,
      detail: "Not read: registered repositories.",
    });
    expect(deployStateNotRead(["global", "repos"])).toEqual({
      ...notice,
      detail: "Not read: Global and registered repositories.",
    });
  });

  it("keeps the approved empty and zero-tool sentences", () => {
    expect(NO_TOOL_DETECTED).toBe(
      "Install Claude Code or Codex to deploy skills globally.",
    );
    expect(NO_REPOSITORIES).toBe(
      "No repositories yet. Select Register repository on the Repositories screen.",
    );
    expect(NO_FILTER_MATCH).toEqual({
      title: "No targets match the filters",
      description: "Select Clear filters to see every target.",
    });
    expect(NO_TARGETS).toEqual({
      title: "No targets yet",
      description: "Global and registered repositories appear here as targets.",
    });
  });

  it("names the packages that are behind but are not skills", () => {
    const one = packageBehindNotice(["foo"]);
    expect([one.level, one.label, plainText(one.message)]).toEqual([
      "info",
      "Package also behind",
      "foo is not a skill.",
    ]);
    const two = packageBehindNotice(["foo", "bar"]);
    expect([two.label, plainText(two.message)]).toEqual([
      "Packages also behind",
      "foo and bar are not skills.",
    ]);
  });

  // #1180: the GitHub column's Unknown badge's cause.
  it("keeps the GitHub column's cause", () => {
    expect(ORIGIN_NOT_READ).toBe(
      "The origin of this repository could not be read. Select Re-read Deploy-state to read it again.",
    );
  });

  // #1181: a skill row's menu item and its Unknown badge's cause.
  it("keeps the skill sub-list's GitHub item", () => {
    expect(VIEW_SKILL_ON_GITHUB).toBe("View skill on GitHub");
  });

  it("names the Targets fact", () => {
    expect(TARGETS_FACT).toBe("Targets");
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
    expect(TIMED_OUT_HINT).toBe("Update check timed out after 1 minute.");
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

  it("says the local edits are being checked", () => {
    expect(CHECKING_LOCAL_EDITS).toBe("Checking for local edits…");
  });

  it("names who reads a Global folder, and a folder Global does not write", () => {
    expect(
      readByLine({
        tools: ["Claude Code", "Cursor", "OpenCode"],
        others: false,
      }),
    ).toBe("Read by Claude Code, Cursor and OpenCode.");
    expect(
      readByLine({
        tools: ["Codex", "Copilot CLI", "Cursor", "Gemini CLI"],
        others: true,
      }),
    ).toBe("Read by Codex, Copilot CLI, Cursor, Gemini CLI and others.");
    expect(readByLine({ tools: ["Codex"], others: false })).toBe(
      "Read by Codex.",
    );
    expect(notWrittenNote("Codex")).toBe("Codex not detected · not written");
  });

  it("advises importing local edits before a behind target updates", () => {
    expect(plainText(localEditsLine(["tdd", "review"], true))).toBe(
      "2 skills have changes that are not in the latest release: tdd and review. To keep them, select Import local edits before you update.",
    );
  });
});
