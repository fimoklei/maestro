import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import type { ReadDriftEntry } from "../drift/use-drift";
import type { DeploymentTarget } from "./deployed-rollup";
import { skillDeployments } from "./skill-deployments";

const ranDrift = (behind: ReadDriftEntry[] = []) =>
  driftViewModel({ data: { behind }, isError: false });

// A ready target with the given label and versioned primitives.
const target = (
  label: string,
  primitives: { name: string; version: string }[],
  behind: ReadDriftEntry[] = [],
): DeploymentTarget => ({
  label,
  target: label.startsWith("/")
    ? { kind: "repo", repoPath: label }
    : { kind: "global" },
  deployed: {
    status: "ready",
    names: primitives.map((primitive) => primitive.name),
    skippedCount: 0,
    attentionCount: 0,
  },
  primitives: primitives.map((primitive) => ({
    type: "skill" as const,
    ...primitive,
  })),
  drift: ranDrift(behind),
});

// The same target, now following one Harness release (ADR-0031). An undefined
// `changedSkills` is the comparison that could not be read.
const onRelease = (
  label: string,
  names: string[],
  changedSkills: string[] | undefined,
): DeploymentTarget => ({
  ...target(
    label,
    names.map((name) => ({ name, version: "v0.3.2" })),
  ),
  releaseHead: {
    release: "v0.3.2",
    latestRelease: "v0.3.4",
    changed: changedSkills?.length ?? null,
    ...(changedSkills ? { changedSkills } : {}),
    selected: names.length,
    comparedAt: "2026-09-12T10:00:00.000Z",
  },
});

describe("skillDeployments", () => {
  it("lists the label and deployed release for each target holding the skill", () => {
    const targets = [
      target("Claude Code", [{ name: "tdd", version: "v1.0.0" }]),
      target("/dev/acme-web", [{ name: "tdd", version: "v1.1.0" }]),
    ];

    expect(skillDeployments("tdd", targets)).toEqual([
      { label: "Claude Code", release: "v1.0.0", status: "up-to-date" },
      { label: "/dev/acme-web", release: "v1.1.0", status: "up-to-date" },
    ]);
  });

  it("omits targets where the skill is not deployed", () => {
    const targets = [
      target("Claude Code", [{ name: "caveman", version: "v2.0.0" }]),
      target("/dev/acme-web", [{ name: "tdd", version: "v1.0.0" }]),
    ];

    expect(skillDeployments("tdd", targets)).toEqual([
      { label: "/dev/acme-web", release: "v1.0.0", status: "up-to-date" },
    ]);
  });

  it("names the target's release and reads behind where this skill changed", () => {
    const targets = [onRelease("Claude Code", ["tdd", "grill"], ["tdd"])];

    expect(skillDeployments("tdd", targets)).toEqual([
      { label: "Claude Code", release: "v0.3.2", status: "behind" },
    ]);
  });

  it("reads a skill the release left alone as up to date on a behind target", () => {
    const targets = [onRelease("Claude Code", ["tdd", "grill"], ["tdd"])];

    expect(skillDeployments("grill", targets)).toEqual([
      { label: "Claude Code", release: "v0.3.2", status: "up-to-date" },
    ]);
  });

  it("reads a target whose comparison could not be read as unknown", () => {
    const targets = [onRelease("Claude Code", ["tdd"], undefined)];

    expect(skillDeployments("tdd", targets)).toEqual([
      { label: "Claude Code", release: "v0.3.2", status: "unknown" },
    ]);
  });

  it("carries the drift status when a target is behind", () => {
    const targets = [
      target(
        "Claude Code",
        [{ name: "tdd", version: "v1.0.0" }],
        [
          {
            name: "tdd",
            current: "v1.0.0",
            latest: "v1.2.0",
            reading: "behind",
          },
        ],
      ),
    ];

    expect(skillDeployments("tdd", targets)).toEqual([
      { label: "Claude Code", release: "v1.0.0", status: "behind" },
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
      { label: "Claude Code", release: "v1.0.0", status: "up-to-date" },
    ]);
  });
});
