import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import type { DeploymentTarget } from "./deployed-rollup";
import { skillDeployments } from "./skill-deployments";

const ranDrift = (
  behind: { name: string; current: string; latest: string }[] = [],
) => driftViewModel({ data: { behind }, isError: false });

// A ready target with the given label and versioned primitives.
const target = (
  label: string,
  primitives: { name: string; version: string }[],
  behind: { name: string; current: string; latest: string }[] = [],
): DeploymentTarget => ({
  label,
  target: label.startsWith("/")
    ? { kind: "repo", repoPath: label }
    : { kind: "global" },
  deployed: {
    status: "ready",
    names: primitives.map((primitive) => primitive.name),
    skippedCount: 0,
  },
  primitives: primitives.map((primitive) => ({
    type: "skill" as const,
    ...primitive,
  })),
  drift: ranDrift(behind),
});

describe("skillDeployments", () => {
  it("lists the label and deployed version for each target holding the skill", () => {
    const targets = [
      target("Claude Code", [{ name: "tdd", version: "v1.0.0" }]),
      target("/dev/acme-web", [{ name: "tdd", version: "v1.1.0" }]),
    ];

    expect(skillDeployments("tdd", targets)).toEqual([
      { label: "Claude Code", version: "v1.0.0", status: "up-to-date" },
      { label: "/dev/acme-web", version: "v1.1.0", status: "up-to-date" },
    ]);
  });

  it("omits targets where the skill is not deployed", () => {
    const targets = [
      target("Claude Code", [{ name: "caveman", version: "v2.0.0" }]),
      target("/dev/acme-web", [{ name: "tdd", version: "v1.0.0" }]),
    ];

    expect(skillDeployments("tdd", targets)).toEqual([
      { label: "/dev/acme-web", version: "v1.0.0", status: "up-to-date" },
    ]);
  });

  it("carries the drift status and latest tag when a target is behind", () => {
    const targets = [
      target(
        "Claude Code",
        [{ name: "tdd", version: "v1.0.0" }],
        [{ name: "tdd", current: "v1.0.0", latest: "v1.2.0" }],
      ),
    ];

    expect(skillDeployments("tdd", targets)).toEqual([
      {
        label: "Claude Code",
        version: "v1.0.0",
        status: "behind",
        latest: "v1.2.0",
      },
    ]);
  });

  it("skips targets whose deploy-state has not resolved or could not be read", () => {
    const targets: DeploymentTarget[] = [
      {
        label: "",
        target: { kind: "global" },
        deployed: { status: "pending" },
        primitives: [],
        drift: ranDrift(),
      },
      {
        label: "",
        target: { kind: "global" },
        deployed: { status: "unknown" },
        primitives: [],
        drift: ranDrift(),
      },
      target("Claude Code", [{ name: "tdd", version: "v1.0.0" }]),
    ];

    expect(skillDeployments("tdd", targets)).toEqual([
      { label: "Claude Code", version: "v1.0.0", status: "up-to-date" },
    ]);
  });
});
