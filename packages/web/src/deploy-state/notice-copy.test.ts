import type { DeploySkillError } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { machineValues, readNotice } from "../test-utils";
import {
  type DeployStateNotice,
  deployNotice,
  deployNoticeFor,
  removeNotice,
  retryNotice,
  updateNotice,
  updatePreviewNotice,
} from "./notice-copy";

// Pins the finished notice per code as data, never measuring the prose itself.
const refusal = (code: string) => new HttpError(422, "unused", code);

describe("deploy notices", () => {
  const cases: [DeploySkillError, DeployStateNotice][] = [
    [
      "unsupported-primitive-type",
      {
        label: "Skills only",
        message:
          "Nothing was deployed. Maestro deploys skills only. Select a skill, then deploy again.",
        detail: "Hooks and MCP servers stay in the Harness.",
      },
    ],
    [
      "invalid-name",
      {
        label: "Unusable skill name",
        message:
          "Nothing was deployed. Rename the skill in the Harness, then deploy again.",
        detail:
          "A skill name uses lowercase letters, digits and single hyphens.",
      },
    ],
    [
      "unknown-skill",
      {
        label: "Skill not in the Inventory",
        message:
          "Nothing was deployed. Select Re-read Inventory, then select the skill again.",
      },
    ],
    [
      "inventory-not-configured",
      {
        label: "No Harness connected",
        message:
          "Nothing was deployed. Select Change Harness location in Settings, then deploy again.",
      },
    ],
    [
      "inventory-unreadable",
      {
        label: "Inventory not read",
        message:
          "Nothing was deployed. Select Re-read Inventory, then deploy again.",
      },
    ],
    [
      "repo-not-registered",
      {
        label: "Repository not registered",
        message:
          "Nothing was deployed. Select Register repository on the Repositories screen, then deploy again.",
      },
    ],
    [
      "inventory-origin-unavailable",
      {
        label: "No GitHub origin",
        message:
          "Nothing was deployed. Point the Harness clone's origin at its GitHub repository, then deploy again.",
        detail:
          "A deploy takes the skill from a GitHub tag, over https or ssh.",
      },
    ],
    [
      "no-published-tag",
      {
        label: "Not in any release",
        message:
          "Nothing was deployed. Select Create a release on the Harness screen, then deploy again.",
        detail: "A deploy takes the skill from a published tag.",
      },
    ],
    [
      "local-diverged-from-tag",
      {
        label: "Harness copy unreleased",
        message:
          "Nothing was deployed. Select Create a release on the Harness screen, then deploy again.",
        detail: "A deploy takes the latest release, not the Harness copy.",
      },
    ],
    [
      "deployed-diverged-from-lock",
      {
        label: "Local changes in deployed files",
        message:
          "Deploy again to replace the local edits with the latest release.",
        detail: "The edits never went through the Harness.",
      },
    ],
    [
      "deployed-unverifiable",
      {
        label: "Local edits unverifiable",
        message: "Deploy again to replace this copy with the latest release.",
        detail:
          "This copy predates content tracking, so any change in it is invisible.",
      },
    ],
    [
      "deployed-unreadable",
      {
        label: "Deployed copy not read",
        message:
          "Nothing was deployed. Make the deployed copy readable, then deploy again.",
        detail: "Its permissions or its shape blocked the check.",
      },
    ],
    [
      "lockfile-malformed",
      {
        label: "Deployment record not read",
        message:
          "Nothing was deployed. Repair or delete apm.lock.yaml in the target, then deploy again.",
        detail:
          "The file is present but does not parse, so the target's state is unknown.",
      },
    ],
    [
      "deploy-in-progress",
      {
        label: "Target busy",
        message:
          "Nothing was deployed. Wait for the running deploy on this target to finish, then deploy again.",
      },
    ],
    [
      "ref-unresolvable",
      {
        label: "Deployed version unknown",
        message:
          "Nothing was deployed. Leave one entry for the Harness in apm.lock.yaml, then deploy again.",
        detail: "The target's record names more than one, or names no release.",
      },
    ],
    [
      "not-at-target-release",
      {
        label: "Not in this release",
        message:
          "Nothing was deployed. Select Update target on the Deploy-state screen to move this target to a release that holds the skill.",
        detail: "This skill is not in the release this target follows.",
      },
    ],
    [
      "target-pinned-per-skill",
      {
        label: "Pinned per skill",
        message:
          "Nothing was deployed. Select Remove skill for each skill on the Deploy-state screen. Then select Deploy skill to put them on one release.",
        detail: "This target holds skills from separate deployments.",
      },
    ],
    [
      "manifest-not-recognised",
      {
        label: "Manifest not recognised",
        message:
          "Nothing was deployed. Leave one dependency on the Harness with a skills list in apm.yml, then deploy again.",
        detail: "Maestro edits that list only, and it found another shape.",
      },
    ],
    [
      "operation-unfinished",
      {
        label: "Unfinished operation",
        message:
          "Nothing was deployed. Open the target on the Deploy-state screen and finish the earlier change, then deploy again.",
        detail: "An earlier change on this target did not finish.",
      },
    ],
    [
      "deploy-incomplete",
      {
        label: "Deploy incomplete",
        message:
          "Part of the selection is not on disk. Open the target on the Deploy-state screen and select Retry deploy.",
        detail: "apm reported success, but some files are missing.",
      },
    ],
    [
      "no-supported-tool",
      {
        label: "No supported tool",
        message:
          "Nothing was deployed. Install Claude Code or Codex, then deploy again.",
        detail: "A global deploy puts skills into Claude Code or Codex.",
      },
    ],
    [
      "auth-required",
      {
        label: "No GitHub access",
        message:
          "Nothing was deployed. Set up GitHub access in git, then deploy again.",
        detail: "GitHub refused the download.",
      },
    ],
    [
      "destination-symlinked",
      {
        label: "Linked skill folder",
        message:
          "Nothing was written. Delete the linked skill folder in the target, then deploy again.",
        detail:
          "This removes the link only. The folder it points at remains on disk.",
      },
    ],
    [
      "deploy-failed",
      {
        label: "Deploy did not finish",
        message:
          "The target may hold a partial deploy. Check the target on the Deploy-state screen, then deploy again.",
      },
    ],
  ];

  it("covers every deploy code", () => {
    expect(cases).toHaveLength(24);
  });

  it.each(cases)("states the whole notice for %s", (code, expected) => {
    expect(deployNoticeFor(code, undefined)).toEqual(expected);
    expect(deployNotice(refusal(code))).toEqual(expected);
  });

  it("falls back to a named outcome for a code it does not know", () => {
    expect(deployNotice(refusal("cost-not-acknowledged"))).toEqual({
      label: "Deploy outcome unknown",
      message:
        "Nothing confirmed the deploy. Deploy again to re-check the target.",
      detail:
        "A dropped connection, or a failure this version of Maestro does not name.",
    });
  });

  it("keeps the server's request-shape sentence for a malformed request", () => {
    const error = new HttpError(
      400,
      "Maestro could not start this change. Reload the page, then try again.",
      "invalid-body",
      { detail: "The request carries a type, a name and a target." },
    );
    expect(deployNotice(error)).toEqual({
      label: "Maestro could not start the action",
      message:
        "Maestro could not start this change. Reload the page, then try again.",
      detail: "The request carries a type, a name and a target.",
    });
  });

  it("never renders the thrown message for an uncovered code", () => {
    const error = new HttpError(
      422,
      "Request failed with status 422.",
      "sunspots",
    );
    expect(deployNotice(error).message).not.toContain("422");
  });
});

describe("remove notices", () => {
  const cases: [string, DeployStateNotice][] = [
    [
      "unsupported-primitive-type",
      {
        label: "Skills only",
        message:
          "Maestro removes skills; hooks and MCP servers stay where they are. Remove a skill instead.",
      },
    ],
    [
      "invalid-name",
      {
        label: "Unusable skill name",
        message:
          "Nothing was removed. A skill name uses lowercase letters, digits and single hyphens.",
      },
    ],
    [
      "repo-not-registered",
      {
        label: "Repository not registered",
        message: "Register this repository in Maestro, then remove again.",
      },
    ],
    [
      "no-supported-tool",
      {
        label: "No supported tool",
        message:
          "Neither Claude Code nor Codex is on this machine. There is nothing here to remove.",
      },
    ],
    [
      "not-deployed",
      {
        label: "Nothing deployed here",
        message:
          "Nothing was removed. Select Re-read Deploy-state on the Deploy-state screen to read the list again.",
      },
    ],
    [
      "lockfile-malformed",
      {
        label: "Deployment record not read",
        message:
          "Repair or delete apm.lock.yaml in the target, then remove again.",
        detail:
          "The file is present but does not parse, so nothing can name what to remove.",
      },
    ],
    [
      "ref-unresolvable",
      {
        label: "Deployed version unknown",
        message:
          "A removal could delete the wrong package. Deploy the skill again to restore a readable entry.",
        detail:
          "Its reference does not point at this skill the way a Maestro deploy would.",
      },
    ],
    [
      "deployed-unreadable",
      {
        label: "Deployed copy not read",
        message:
          "Nothing can say what a removal would delete. Make the deployed copy readable, then remove again.",
      },
    ],
    [
      "deployed-diverged-pinned-per-skill",
      {
        label: "Local changes in deployed files",
        message:
          "The skill was not removed. Its files changed after deployment.",
        detail:
          "Save the changes. Restore the files from the skill's deployed version in the Harness clone, then select Remove skill again.",
      },
    ],
    [
      "cost-not-acknowledged",
      {
        label: "Removal not confirmed",
        message:
          "Nothing was removed. A copy changed after the check. Read the list again, then select Remove skill.",
      },
    ],
    [
      "remove-in-progress",
      {
        label: "Target busy",
        message:
          "A removal is still running on this target. Wait for it to finish.",
      },
    ],
    [
      "remove-incomplete",
      {
        label: "Removal incomplete",
        message:
          "The skill's files are still on disk. Select Retry removal to run the same removal again.",
        detail: "apm reported success, but some files are missing.",
      },
    ],
    [
      "remove-failed",
      {
        label: "Removal outcome unknown",
        message:
          "The copy may be gone or may still be there. Confirm the removal again to delete whatever is left.",
        detail: "The removal ran but proved nothing.",
      },
    ],
    [
      "preflight-failed",
      {
        label: "Deployed files not checked",
        message:
          "Make the deployed copy readable, then start the removal again.",
      },
    ],
  ];

  it.each(cases)("states the whole notice for %s", (code, expected) => {
    expect(removeNotice(refusal(code))).toEqual(expected);
  });

  it("states the removal's own way through, not the deploy's", () => {
    expect(removeNotice(refusal("repo-not-registered")).message).toContain(
      "remove again",
    );
    expect(deployNotice(refusal("repo-not-registered")).message).toContain(
      "deploy again",
    );
  });

  it("falls back to a named outcome when nothing confirmed the removal", () => {
    expect(removeNotice(new Error("offline"))).toEqual({
      label: "Removal outcome unknown",
      message:
        "Nothing confirmed the removal. Check the target on the Deploy-state screen to see whether the skill is still deployed.",
      detail:
        "A dropped connection, or a failure this version of Maestro does not name.",
    });
  });

  it("keeps the server's request-shape sentence for a malformed request", () => {
    const error = new HttpError(
      400,
      "Maestro could not start this change. Reload the page, then try again.",
      "invalid-body",
      { detail: "The request carries a type, a name and a target." },
    );
    expect(removeNotice(error)).toEqual({
      label: "Maestro could not start the action",
      message:
        "Maestro could not start this change. Reload the page, then try again.",
      detail: "The request carries a type, a name and a target.",
    });
  });
});

describe("update preview notices", () => {
  const cases: [string, DeployStateNotice][] = [
    [
      "repo-not-registered",
      {
        label: "Repository not registered",
        message:
          "Register this repository in Maestro, then select Update target again.",
      },
    ],
    [
      "no-supported-tool",
      {
        label: "No supported tool",
        message:
          "Neither Claude Code nor Codex is on this machine. There is nothing here to update.",
      },
    ],
    [
      "not-deployed",
      {
        label: "Nothing deployed here",
        message:
          "This target follows no release. Select Deploy skill in the Inventory to put one on it.",
      },
    ],
    [
      "lockfile-malformed",
      {
        label: "Deployment record not read",
        message:
          "Repair or delete apm.lock.yaml in the target, then select Update target again.",
        detail:
          "The file is present but does not parse, so the target's state is unknown.",
      },
    ],
    [
      "deployed-unreadable",
      {
        label: "Deployed copy not read",
        message:
          "Nothing was changed. Make the deployed copy readable, then select Update target again.",
        detail: "Its permissions or its shape blocked the check.",
      },
    ],
    [
      "inventory-not-configured",
      {
        label: "No Harness connected",
        message:
          "Select Change Harness location in Settings, then select Update target again.",
      },
    ],
    [
      "inventory-unreadable",
      {
        label: "Inventory not read",
        message:
          "Select Re-read Inventory on the Harness location screen, then select Update target again.",
      },
    ],
    [
      "no-published-tag",
      {
        label: "Not in any release",
        message:
          "Select Create a release on the Harness screen, then select Update target again.",
        detail: "An update moves the target to a published tag.",
      },
    ],
    [
      "skill-not-in-release",
      {
        label: "Not in the latest release",
        message:
          "The latest release does not hold this skill. Select Create a release on the Harness screen, then deploy again.",
        detail: "Nothing was changed, and the target keeps its own release.",
      },
    ],
    [
      "inventory-origin-unavailable",
      {
        label: "No GitHub origin",
        message:
          "Point the Harness clone's origin at its GitHub repository, then select Update target again.",
        detail:
          "An update takes the skill from a GitHub tag, over https or ssh.",
      },
    ],
    [
      "ref-unresolvable",
      {
        label: "Deployed version unknown",
        message:
          "Nothing was changed. Leave one entry for the Harness in apm.lock.yaml, then select Update target again.",
        detail: "The target's record names more than one, or names no release.",
      },
    ],
    [
      "preview-failed",
      {
        label: "Preview did not run",
        message:
          "Nothing was changed. Wait a moment, then select Update target again.",
      },
    ],
  ];

  it.each(cases)("states %s", (code, expected) => {
    expect(updatePreviewNotice(refusal(code), "Update target")).toEqual(
      expected,
    );
  });

  it("names the control by the label the target's row gives it", () => {
    const label = "Update targets";
    expect(updatePreviewNotice(new Error("offline"), label).message).toBe(
      "Nothing was changed. Wait a moment, then select Update targets again.",
    );
    expect(updateNotice(refusal("status-out-of-date"), label).message).toBe(
      "Nothing was changed. The target changed after the preview. Select Update targets again.",
    );
  });

  it("names a failure it has no code for", () => {
    expect(updatePreviewNotice(new Error("offline"), "Update target")).toEqual({
      label: "Preview outcome unknown",
      message:
        "Nothing was changed. Wait a moment, then select Update target again.",
      detail:
        "A dropped connection, or a failure this version of Maestro does not name.",
    });
  });
});

describe("update notices", () => {
  it("states a target that changed after the preview", () => {
    expect(
      updateNotice(refusal("status-out-of-date"), "Update target"),
    ).toEqual({
      label: "Status out of date",
      message:
        "Nothing was changed. The target changed after the preview. Select Update target again.",
    });
  });
});

describe("update notices for a linked skill folder", () => {
  const LINKED = "/Users/dev/.claude/skills/tdd";
  const linked = (body: unknown) =>
    new HttpError(409, "unused", "destination-symlinked", body);

  it.each([
    ["preview", updatePreviewNotice],
    ["run", updateNotice],
  ])("spells out the rm for the path the server read (%s)", (_, notice) => {
    expect(
      readNotice(
        notice(
          linked({ error: "destination-symlinked", linkedPath: LINKED }),
          "Update target",
        ),
      ),
    ).toEqual({
      label: "Linked skill folder",
      message: `Nothing was written. Run rm ${LINKED} and then select Update target again.`,
      detail:
        "This removes the link only. The folder it points at remains on disk.",
    });
  });

  it.each([
    ["preview", updatePreviewNotice],
    ["run", updateNotice],
  ])("names the folder in general when no path came back (%s)", (_, notice) => {
    expect(
      notice(linked({ error: "destination-symlinked" }), "Update target"),
    ).toEqual({
      label: "Linked skill folder",
      message:
        "Nothing was written. Delete the linked skill folder in the target, then select Update target again.",
      detail:
        "This removes the link only. The folder it points at remains on disk.",
    });
  });
});

describe("deploy notice for a linked skill folder", () => {
  it("spells out the rm for the path a bulk run carries", () => {
    expect(
      readNotice(
        deployNoticeFor(
          "destination-symlinked",
          "/Users/dev/.claude/skills/tdd",
        ),
      ),
    ).toEqual({
      label: "Linked skill folder",
      message:
        "Nothing was written. Run rm /Users/dev/.claude/skills/tdd and then deploy again.",
      detail:
        "This removes the link only. The folder it points at remains on disk.",
    });
  });

  it("spells out the rm for the path the server read", () => {
    const error = new HttpError(409, "unused", "destination-symlinked", {
      error: "destination-symlinked",
      linkedPath: "/Users/dev/.claude/skills/tdd",
    });

    expect(readNotice(deployNotice(error))).toEqual({
      label: "Linked skill folder",
      message:
        "Nothing was written. Run rm /Users/dev/.claude/skills/tdd and then deploy again.",
      detail:
        "This removes the link only. The folder it points at remains on disk.",
    });
  });

  it("sets the rm command apart, path included", () => {
    const notice = deployNoticeFor(
      "destination-symlinked",
      "/Users/dev/.claude/skills/tdd",
    );

    expect(machineValues(notice.message)).toEqual([
      "rm /Users/dev/.claude/skills/tdd",
    ]);
  });
});

describe("notices that send the reader to the target", () => {
  it.each([
    ["remove, unfinished", removeNotice(refusal("operation-unfinished"))],
    [
      "update, unfinished",
      updateNotice(refusal("operation-unfinished"), "Update target"),
    ],
    ["update, failed", updateNotice(refusal("update-failed"), "Update target")],
    ["update, unknown", updateNotice(new Error("offline"), "Update target")],
  ])("names the Deploy-state screen (%s)", (_, notice) => {
    expect(notice.message).toContain("on the Deploy-state screen");
    expect(notice.message).not.toContain("target card");
  });
});

describe("retry notices", () => {
  const deploy = { kind: "deploy", release: "v0.3.4" } as const;
  const cases: [string, DeployStateNotice][] = [
    [
      "repo-not-registered",
      {
        label: "Repository not registered",
        message:
          "Nothing was changed. Select Register repository on the Repositories screen, then select Retry deploy again.",
      },
    ],
    [
      "nothing-to-retry",
      {
        label: "Change already finished",
        message:
          "Nothing was changed. The earlier change on this target already finished.",
      },
    ],
    [
      "retry-in-progress",
      {
        label: "Target busy",
        message:
          "Nothing was changed. Wait for the running change to finish, then select Retry deploy again.",
      },
    ],
    [
      "deployed-diverged-from-lock",
      {
        label: "Local changes in deployed files",
        message:
          "Nothing was changed. Undo the local edits in the deployed files, then select Retry deploy again.",
        detail: "The edits never went through the Harness.",
      },
    ],
    [
      "deployed-unverifiable",
      {
        label: "Local edits unverifiable",
        message:
          "Nothing was changed. Delete the unverified copies in the target, then select Retry deploy again.",
        detail:
          "These copies predate content tracking, so any change in them is invisible.",
      },
    ],
    [
      "deployed-unreadable",
      {
        label: "Deployed copy not read",
        message:
          "Nothing was changed. Make the deployed copy readable, then select Retry deploy again.",
        detail: "Its permissions or its shape blocked the check.",
      },
    ],
    [
      "lockfile-malformed",
      {
        label: "Deployment record not read",
        message:
          "Nothing was changed. Repair or delete apm.lock.yaml in the target, then select Retry deploy again.",
        detail:
          "The file is present but does not parse, so the target's state is unknown.",
      },
    ],
    [
      "manifest-not-recognised",
      {
        label: "Manifest not recognised",
        message:
          "Nothing was changed. Leave one dependency on the Harness with a skills list in apm.yml, then select Retry deploy again.",
        detail: "Maestro edits that list only, and it found another shape.",
      },
    ],
    [
      "retry-incomplete",
      {
        label: "Deploy still incomplete",
        message:
          "Part of the selection is not on disk. Select Retry deploy to deploy release v0.3.4 again.",
        detail: "apm reported success, but some files are missing.",
      },
    ],
    [
      "retry-failed",
      {
        label: "Deploy outcome unknown",
        message:
          "Nothing proved the deploy finished. Select Retry deploy to run it again.",
      },
    ],
  ];

  it.each(cases)("states %s", (code, notice) => {
    expect(readNotice(retryNotice(refusal(code), deploy))).toEqual(notice);
  });

  it("states a retry that never answered", () => {
    expect(retryNotice(new Error("offline"), deploy)).toEqual({
      label: "Deploy outcome unknown",
      message:
        "Nothing proved the deploy finished. Select Retry deploy to run it again.",
      detail:
        "A dropped connection, or a failure this version of Maestro does not name.",
    });
  });

  it.each([
    [
      "remove",
      "Removal still incomplete",
      "The skill's files are still on disk. Select Retry removal to run the same removal again.",
    ],
    [
      "update",
      "Update still incomplete",
      "The update is incomplete. Select Retry update to run the same release again.",
    ],
  ] as const)(
    "states an unfinished %s that is still incomplete",
    (kind, label, message) => {
      expect(
        retryNotice(refusal("retry-incomplete"), { kind, release: "v0.3.4" }),
      ).toEqual({
        label,
        message,
        detail: "apm reported success, but some files are missing.",
      });
    },
  );

  it.each([
    [
      "remove",
      "Removal outcome unknown",
      "Nothing proved the removal finished. Select Retry removal to run it again.",
    ],
    [
      "update",
      "Update outcome unknown",
      "Nothing proved the update finished. Select Retry update to run it again.",
    ],
  ] as const)("names the %s in a failed retry", (kind, label, message) => {
    expect(
      retryNotice(refusal("retry-failed"), { kind, release: "v0.3.4" }),
    ).toEqual({ label, message });
  });
});
