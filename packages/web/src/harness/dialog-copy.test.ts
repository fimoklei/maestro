import { describe, expect, it } from "vitest";
import { plainText } from "../ui/phrase";
import {
  ADVISORY_TEXT,
  FINDING_TEXT,
  FOLDER_MISSING,
  inFlightNotice,
  releaseWithdrawalBody,
  releaseWithdrawalFilesNotice,
  rootSkillFileNotice,
  skillChecksNotice,
  withdrawBody,
} from "./dialog-copy";
import { defaultBranchCopy } from "./stage-copy";

describe("Harness dialog copy", () => {
  it("names the pull request in a withdrawal only where one is open (#1639)", () => {
    const main = defaultBranchCopy("main");

    expect(plainText(withdrawBody("skill", main, true))).toBe(
      "This replaces the skill folder in your clone with its copy on main. You cannot recover your changes. It closes the pull request and deletes the proposal branch. Deployed copies remain unchanged.",
    );
    expect(plainText(withdrawBody("skill", main, false))).toBe(
      "This replaces the skill folder in your clone with its copy on main. You cannot recover your changes. It deletes the proposal branch. Deployed copies remain unchanged.",
    );
  });

  it.each([
    [
      "skill",
      "edit",
      "This replaces the skill folder in your clone with its copy in the latest release. The skill then waits under Pending proposal. Deployed copies remain unchanged.",
    ],
    [
      "skill",
      "addition",
      "This removes the skill folder from your clone. The skill then waits under Pending proposal. Deployed copies remain unchanged.",
    ],
    [
      "skill",
      "deletion",
      "This brings back the skill folder from the latest release. The skill then waits under Pending proposal. Deployed copies remain unchanged.",
    ],
    [
      "skill",
      "rename",
      "This brings back tdd from the latest release and removes the new name. The skill then waits under Pending proposal. Deployed copies remain unchanged.",
    ],
    [
      "prompt",
      "edit",
      "This replaces the prompt file in your clone with its copy in the latest release. The prompt then waits under Pending proposal.",
    ],
  ] as const)(
    "states what a withdrawal from release of a %s %s changes, then what stays",
    (type, change, body) => {
      expect(plainText(releaseWithdrawalBody(type, change, "tdd"))).toBe(body);
    },
  );

  it("names the files a withdrawal from release replaces, and none where it replaces none", () => {
    expect(releaseWithdrawalFilesNotice([])).toBeNull();
    const notice = releaseWithdrawalFilesNotice([".apm/skills/tdd/SKILL.md"]);
    expect(notice?.label).toBe("Changes not yet proposed");
    expect(plainText(notice?.message ?? "")).toBe(
      "Withdraw from release discards the changes in these files. To keep them, copy them outside your clone first.",
    );
    expect(notice?.items?.map((item) => plainText(item))).toEqual([
      ".apm/skills/tdd/SKILL.md",
    ]);
  });

  it("warns about skill checks in one wording, naming the step still open", () => {
    expect(
      skillChecksNotice("import", ["SKILL.md is over 500 lines."]),
    ).toEqual({
      level: "warning",
      label: "Skill checks found issues",
      message: "You can still import the skill.",
      items: ["SKILL.md is over 500 lines."],
    });
    expect(skillChecksNotice("update", []).message).toBe(
      "You can still update the skill.",
    );
    expect(skillChecksNotice("publish", []).message).toBe(
      "You can still publish the release.",
    );
  });

  it("warns about in-flight items by name, and says nothing without them", () => {
    expect(inFlightNotice([])).toBeNull();
    const one = inFlightNotice(["research"]);
    expect(one?.level).toBe("warning");
    expect(one?.label).toBe("Release uses older versions");
    expect(plainText(one?.message ?? "")).toBe(
      "These skills and prompts have newer changes that are not merged: research.",
    );
    expect(
      plainText(inFlightNotice(["research", "standup", "tdd"])?.message ?? ""),
    ).toBe(
      "These skills and prompts have newer changes that are not merged: research, standup and tdd.",
    );
  });

  it("blocks a release on a root SKILL.md, naming the file and the branch", () => {
    const notice = rootSkillFileNotice("main");

    expect(notice.level).toBe("error");
    expect(notice.label).toBe("SKILL.md at the Harness root");
    expect(plainText(notice.message)).toBe(
      "Remove SKILL.md from the root of main on GitHub. Select Re-read Harness, then select Create a release again.",
    );
    expect(notice.detail).toBe(
      "Every target would get the whole Harness as one skill.",
    );
  });

  it("states each release check as a fact about the skill", () => {
    expect(FINDING_TEXT).toEqual({
      "missing-manifest": "has no SKILL.md.",
      "invalid-frontmatter": "has frontmatter Maestro cannot read.",
      "empty-description": "has an empty description.",
    });
  });

  it("states each import check", () => {
    expect(ADVISORY_TEXT).toEqual({
      "long-manifest": "SKILL.md is over 500 lines.",
      "long-description": "The description is over 1,024 characters.",
    });
  });

  it("asks for the skill folder when Import skill is submitted without one", () => {
    expect(FOLDER_MISSING).toBe("Enter the skill folder's absolute path.");
  });
});
