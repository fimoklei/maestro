import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import {
  type DeployStateNotice,
  deployNotice,
  FIX_AND_RELEASE,
  removeNotice,
} from "./notice-copy";

// Asserted as data, never as prose: ADR-0025 §10 rejected a copy linter, so a
// test that measured capitalisation or word count would be that linter under
// another name. What is pinned here is the finished notice per code.
const refusal = (code: string) => new HttpError(422, "unused", code);

describe("deploy notices", () => {
  const cases: [string, DeployStateNotice][] = [
    [
      "unsupported-primitive-type",
      {
        level: "error",
        label: "Skills only",
        message:
          "Maestro deploys skills; hooks and MCP servers stay in the Harness. Deploy a skill instead.",
      },
    ],
    [
      "invalid-name",
      {
        level: "error",
        label: "Unusable skill name",
        message:
          "A skill name uses lowercase letters, digits and single hyphens. Rename it in the Harness, then deploy again.",
      },
    ],
    [
      "unknown-skill",
      {
        level: "error",
        label: "Skill not in the Inventory",
        message:
          "Re-read the Inventory, then pick the skill from the list again.",
      },
    ],
    [
      "inventory-not-configured",
      {
        level: "error",
        label: "No Harness connected",
        message:
          "Connect a Harness on the Inventory screen, then deploy again.",
      },
    ],
    [
      "repo-not-registered",
      {
        level: "error",
        label: "Repository not registered",
        message: "Register this repository in Maestro, then deploy again.",
      },
    ],
    [
      "inventory-origin-unavailable",
      {
        level: "error",
        label: "No GitHub origin",
        message:
          "Point the Harness clone's origin at its GitHub repository, then deploy again.",
        detail: "A deploy installs from a GitHub tag, over https or ssh.",
      },
    ],
    [
      "no-published-tag",
      {
        level: "error",
        label: "Not in any release",
        message: "Publish a release on the Harness screen, then deploy again.",
        detail: "A deploy installs from a published tag.",
      },
    ],
    [
      "local-diverged-from-tag",
      {
        level: "error",
        label: "Harness copy unreleased",
        message:
          "A deploy installs the latest release, not the Harness copy. Publish a release, then deploy again.",
      },
    ],
    [
      "deployed-diverged-from-lock",
      {
        level: "warning",
        label: "Local edits in the deployed copy",
        message:
          "Deploy again to replace the local edits with the latest release.",
        detail: "The edits never went through the Harness.",
      },
    ],
    [
      "deployed-unverifiable",
      {
        level: "warning",
        label: "Local edits unverifiable",
        message: "Deploy again to replace this copy with the latest release.",
        detail:
          "This copy predates content tracking, so any change in it is invisible.",
      },
    ],
    [
      "deployed-unreadable",
      {
        level: "error",
        label: "Deployed copy unreadable",
        message:
          "Nothing was installed. Make the deployed copy readable, then deploy again.",
        detail: "Its permissions or its shape blocked the check.",
      },
    ],
    [
      "lockfile-malformed",
      {
        level: "error",
        label: "Deployment record unreadable",
        message:
          "Repair or delete apm.lock.yaml in the target, then deploy again.",
        detail:
          "The file is present but does not parse, so the target's state is unknown.",
      },
    ],
    [
      "deploy-in-progress",
      {
        level: "error",
        label: "Deploy already running",
        message:
          "This target takes one change at a time. Wait for the running deploy to finish.",
      },
    ],
    [
      "no-supported-tool",
      {
        level: "error",
        label: "No supported tool",
        message:
          "A global deploy installs into Claude Code or Codex. Install one, then deploy again.",
      },
    ],
    [
      "auth-required",
      {
        level: "error",
        label: "No GitHub access",
        message:
          "Nothing was installed. Set up GitHub access in git, then deploy again.",
        detail: "GitHub refused the download.",
      },
    ],
    [
      "destination-symlinked",
      {
        level: "error",
        label: "Linked skill folder",
        message:
          "Nothing was written. Replace the link with a real folder, then deploy again.",
        detail:
          "Moving the link up, so the whole skills folder is the link, also works.",
      },
    ],
    [
      "deployed-unsupported-package-type",
      {
        level: "error",
        label: "Unsupported package type",
        message: `Its files are still there. ${FIX_AND_RELEASE}`,
      },
    ],
    [
      "deploy-recorded-invalid",
      {
        level: "error",
        label: "No files deployed",
        message:
          "Add a SKILL.md in the Harness, publish a release, then deploy again.",
      },
    ],
    [
      "deploy-unverified",
      {
        level: "error",
        label: "Deploy unproven",
        message:
          "The target's deployment record does not show it. Deploy again to re-check the target.",
      },
    ],
    [
      "deploy-failed",
      {
        level: "error",
        label: "Deploy stopped part-way",
        message:
          "The target may hold a partial install. Check its state below, then deploy again.",
      },
    ],
  ];

  it.each(cases)("states the whole notice for %s", (code, expected) => {
    expect(deployNotice(refusal(code))).toEqual(expected);
  });

  it("falls back to a named outcome for a code it does not know", () => {
    expect(deployNotice(refusal("cost-not-acknowledged"))).toEqual({
      level: "error",
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
      "Nothing reached the target. Reload the page, then start the change again.",
      "invalid-body",
      { detail: "The request carries a type, a name and a target." },
    );
    expect(deployNotice(error)).toEqual({
      level: "error",
      label: "Request not accepted",
      message:
        "Nothing reached the target. Reload the page, then start the change again.",
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
        level: "error",
        label: "Skills only",
        message:
          "Maestro removes skills; hooks and MCP servers stay where they are. Remove a skill instead.",
      },
    ],
    [
      "invalid-name",
      {
        level: "error",
        label: "Unusable skill name",
        message:
          "Nothing was removed. A skill name uses lowercase letters, digits and single hyphens.",
      },
    ],
    [
      "repo-not-registered",
      {
        level: "error",
        label: "Repository not registered",
        message: "Register this repository in Maestro, then remove again.",
      },
    ],
    [
      "no-supported-tool",
      {
        level: "error",
        label: "No supported tool",
        message:
          "Neither Claude Code nor Codex is on this machine. There is nothing here to remove.",
      },
    ],
    [
      "not-deployed",
      {
        level: "error",
        label: "Nothing deployed here",
        message: "Nothing was deleted. Reload the page to read the list again.",
      },
    ],
    [
      "lockfile-malformed",
      {
        level: "error",
        label: "Deployment record unreadable",
        message:
          "Repair or delete apm.lock.yaml in the target, then remove again.",
        detail:
          "The file is present but does not parse, so nothing can name what to remove.",
      },
    ],
    [
      "ref-unresolvable",
      {
        level: "error",
        label: "Unrecognisable deployment entry",
        message:
          "A removal could delete the wrong package. Deploy the skill again to restore a readable entry.",
        detail:
          "Its reference does not point at this skill the way a Maestro deploy would.",
      },
    ],
    [
      "deployed-unreadable",
      {
        level: "error",
        label: "Deployed copy unreadable",
        message:
          "Nothing can say what a removal would delete. Make the deployed copy readable, then remove again.",
      },
    ],
    [
      "cost-not-acknowledged",
      {
        level: "warning",
        label: "Nothing removed",
        message:
          "The copy on disk changed since this removal was priced. Check the new cost above, then remove the skill.",
      },
    ],
    [
      "remove-in-progress",
      {
        level: "error",
        label: "Change already running",
        message:
          "This target takes one change at a time. Wait for the running change to finish.",
      },
    ],
    [
      "remove-failed",
      {
        level: "error",
        label: "Removal unproven",
        message:
          "The copy may be gone or may still be there. Confirm the removal again to delete whatever is left.",
        detail: "The removal ran but proved nothing.",
      },
    ],
    [
      "preflight-failed",
      {
        level: "error",
        label: "Check did not run",
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
      level: "error",
      label: "Removal outcome unknown",
      message:
        "Nothing confirmed the removal. Reload the page, then check whether the skill is still deployed.",
      detail:
        "A dropped connection, or a failure this version of Maestro does not name.",
    });
  });

  it("keeps the server's request-shape sentence for a malformed request", () => {
    const error = new HttpError(
      400,
      "Nothing reached the target. Reload the page, then start the change again.",
      "invalid-body",
      { detail: "The request carries a type, a name and a target." },
    );
    expect(removeNotice(error)).toEqual({
      level: "error",
      label: "Request not accepted",
      message:
        "Nothing reached the target. Reload the page, then start the change again.",
      detail: "The request carries a type, a name and a target.",
    });
  });
});

describe("every deploy and remove notice", () => {
  const codes = [
    "unsupported-primitive-type",
    "invalid-name",
    "unknown-skill",
    "inventory-not-configured",
    "repo-not-registered",
    "inventory-origin-unavailable",
    "no-published-tag",
    "local-diverged-from-tag",
    "deployed-diverged-from-lock",
    "deployed-unverifiable",
    "deployed-unreadable",
    "lockfile-malformed",
    "deploy-in-progress",
    "no-supported-tool",
    "auth-required",
    "destination-symlinked",
    "deployed-unsupported-package-type",
    "deploy-recorded-invalid",
    "deploy-unverified",
    "deploy-failed",
    "not-deployed",
    "ref-unresolvable",
    "cost-not-acknowledged",
    "remove-in-progress",
    "remove-failed",
    "preflight-failed",
  ];

  const notices = codes.flatMap((code) => [
    deployNotice(refusal(code)),
    removeNotice(refusal(code)),
  ]);

  it("never addresses the reader as you", () => {
    for (const notice of notices) {
      expect(`${notice.message} ${notice.detail ?? ""}`).not.toMatch(
        /\byou\b|\byour\b/i,
      );
    }
  });

  it("never writes valid or invalid on screen (F13)", () => {
    for (const notice of notices) {
      expect(
        `${notice.label} ${notice.message} ${notice.detail ?? ""}`,
      ).not.toMatch(/\bin?valid\b/i);
    }
  });
});
