import { describe, expect, it } from "vitest";
import { proposeReleaseVersion } from "./propose-release-version";
import type { SkillMovement } from "./skill-movements";

const added: SkillMovement = { kind: "added", name: "planner" };
const changed: SkillMovement = { kind: "changed", name: "reviewer" };
const removed: SkillMovement = { kind: "removed", name: "old" };
const renamed: SkillMovement = {
  kind: "renamed",
  name: "new",
  previousName: "old",
};

describe("proposeReleaseVersion", () => {
  it("proposes exactly v0.1.0 for a first release, whatever moved", () => {
    const proposal = proposeReleaseVersion(null, [added, changed]);
    expect(proposal.proposedStep).toBe("minor");
    expect(proposal.versions.minor).toBe("v0.1.0");
    expect(proposal.reason).toContain("First release");
  });

  it("proposes v0.1.0 for a first release even with no movement", () => {
    const proposal = proposeReleaseVersion(null, []);
    expect(proposal.versions[proposal.proposedStep]).toBe("v0.1.0");
  });

  it("proposes major when a skill was removed", () => {
    const proposal = proposeReleaseVersion("v1.2.3", [changed, removed]);
    expect(proposal.proposedStep).toBe("major");
    expect(proposal.versions.major).toBe("v2.0.0");
    // "Deleted", never "removed": remove names a deployed copy alone.
    expect(proposal.reason).toBe("A skill was deleted or renamed.");
  });

  it("proposes major when a skill was renamed", () => {
    const proposal = proposeReleaseVersion("v1.2.3", [renamed]);
    expect(proposal.proposedStep).toBe("major");
  });

  it("proposes minor when a skill was added and none removed", () => {
    const proposal = proposeReleaseVersion("v1.2.3", [added, changed]);
    expect(proposal.proposedStep).toBe("minor");
    expect(proposal.versions.minor).toBe("v1.3.0");
  });

  it("proposes patch when only existing skills changed", () => {
    const proposal = proposeReleaseVersion("v1.2.3", [changed]);
    expect(proposal.proposedStep).toBe("patch");
    expect(proposal.versions.patch).toBe("v1.2.4");
  });

  it("offers all three steps computed from the previous tag", () => {
    const proposal = proposeReleaseVersion("v1.2.3", [changed]);
    expect(proposal.versions).toEqual({
      major: "v2.0.0",
      minor: "v1.3.0",
      patch: "v1.2.4",
    });
    expect(proposal.previousTag).toBe("v1.2.3");
  });

  it("reads double-digit version parts numerically", () => {
    const proposal = proposeReleaseVersion("v0.10.9", [changed]);
    expect(proposal.versions.patch).toBe("v0.10.10");
    expect(proposal.versions.minor).toBe("v0.11.0");
  });

  it("keeps a version part past the safe integer range exact", () => {
    const proposal = proposeReleaseVersion("v9007199254740993.0.0", [changed]);

    expect(proposal.versions.patch).toBe("v9007199254740993.0.1");
    expect(proposal.versions.major).toBe("v9007199254740994.0.0");
  });

  it("reads a leading-zero tag as no release at all", () => {
    const proposal = proposeReleaseVersion("v01.2.3", [changed]);

    expect(proposal.versions[proposal.proposedStep]).toBe("v0.1.0");
    expect(proposal.reason).toContain("First release");
  });

  it("says nothing changed rather than claiming existing skills did", () => {
    const proposal = proposeReleaseVersion("v1.2.3", []);

    expect(proposal.reason).toBe("Nothing has changed since the last release.");
    expect(proposal.proposedStep).toBe("patch");
  });
});
