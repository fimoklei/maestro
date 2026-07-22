import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import type { DriftResponse } from "../drift/use-drift";
import { type DeploymentTarget, rollUpDeployment } from "./deployed-rollup";

// The deployed column is a client-side pivot: the per-target deploy-state + drift
// reads folded onto one row per skill (#272). A target is each global tool-install
// and each registered repo, counted individually. These behaviours are exercised
// here through the one pure function the rendered cell reads.

const ranDrift = (
  behind: { name: string; current: string; latest: string }[],
) => driftViewModel({ data: { behind }, isError: false });

const drift = (state: { data?: DriftResponse; isError?: boolean }) =>
  driftViewModel({ data: state.data, isError: state.isError ?? false });

const pair = (name: string) => ({ name, current: "v1.0.0", latest: "v1.1.0" });

// A target that is deployed (deploy-state read cleanly) with the given names, and
// whose drift check produced the given behind set.
const deployedTarget = (
  names: string[],
  behind: { name: string; current: string; latest: string }[] = [],
): DeploymentTarget => ({
  deployed: { status: "ready", names, skippedCount: 0 },
  drift: ranDrift(behind),
});

describe("rollUpDeployment — target count", () => {
  it("counts every target the skill is deployed to", () => {
    const targets = [
      deployedTarget(["tdd", "caveman"]),
      deployedTarget(["tdd"]),
      deployedTarget(["research"]),
    ];
    expect(rollUpDeployment("tdd", targets).targetCount).toBe(2);
  });

  it("counts zero when the skill is deployed nowhere", () => {
    const targets = [deployedTarget(["caveman"]), deployedTarget(["research"])];
    expect(rollUpDeployment("tdd", targets).targetCount).toBe(0);
  });

  it("does not count a target whose deploy-state has not resolved yet", () => {
    const targets: DeploymentTarget[] = [
      { deployed: { status: "pending" }, drift: ranDrift([]) },
      deployedTarget(["tdd"]),
    ];
    expect(rollUpDeployment("tdd", targets).targetCount).toBe(1);
  });

  it("does not count a target whose deploy-state could not be read", () => {
    const targets: DeploymentTarget[] = [
      { deployed: { status: "unknown" }, drift: ranDrift([]) },
      deployedTarget(["tdd"]),
    ];
    expect(rollUpDeployment("tdd", targets).targetCount).toBe(1);
  });
});

describe("rollUpDeployment — pending keeps a zero reach honest (J04)", () => {
  it("flags the roll-up pending while a target's deploy-state is still loading", () => {
    // A skill's reach is not yet known while any target's local read is in
    // flight; a 0 count then is "unconfirmed", not a confirmed "deployed
    // nowhere".
    const targets: DeploymentTarget[] = [
      { deployed: { status: "pending" }, drift: ranDrift([]) },
      deployedTarget(["caveman"]),
    ];
    expect(rollUpDeployment("tdd", targets).pending).toBe(true);
  });

  it("is not pending once every target's deploy-state has resolved", () => {
    const targets = [deployedTarget(["caveman"]), deployedTarget(["research"])];
    expect(rollUpDeployment("tdd", targets).pending).toBe(false);
  });

  it("flags the roll-up unreadable when a target's deploy-state read failed", () => {
    // A failed read (a malformed lockfile) leaves the reach unconfirmed just as a
    // still-loading read does — a 0 count is not a confirmed "deployed nowhere".
    const targets: DeploymentTarget[] = [
      { deployed: { status: "unknown" }, drift: ranDrift([]) },
      deployedTarget(["caveman"]),
    ];
    expect(rollUpDeployment("tdd", targets).unreadable).toBe(true);
  });

  it("is not unreadable when every deploy-state read resolved cleanly", () => {
    const targets = [deployedTarget(["caveman"]), deployedTarget(["research"])];
    expect(rollUpDeployment("tdd", targets).unreadable).toBe(false);
  });
});

describe("rollUpDeployment — behind count (▲N)", () => {
  it("counts targets where the deployed skill is confirmed behind", () => {
    const targets = [
      deployedTarget(["tdd"], [pair("tdd")]),
      deployedTarget(["tdd"], [pair("tdd")]),
      deployedTarget(["tdd"], []),
    ];
    expect(rollUpDeployment("tdd", targets).behindCount).toBe(2);
  });

  it("does not count a behind name that is not deployed at that target", () => {
    // An orphan-behind (the check names tdd, but tdd is not deployed here) must
    // not inflate the chip.
    const targets = [deployedTarget(["caveman"], [pair("tdd")])];
    expect(rollUpDeployment("tdd", targets).behindCount).toBe(0);
  });
});

describe("rollUpDeployment — unknown count (?) keeps J04 honesty", () => {
  it("counts a deployed target whose check could not run", () => {
    const targets: DeploymentTarget[] = [
      {
        deployed: { status: "ready", names: ["tdd"], skippedCount: 0 },
        drift: drift({ data: { ok: false } }),
      },
    ];
    expect(rollUpDeployment("tdd", targets).unknownCount).toBe(1);
  });

  it("counts a deployed target whose source could not be reached (unverified)", () => {
    const targets: DeploymentTarget[] = [
      {
        deployed: { status: "ready", names: ["tdd"], skippedCount: 0 },
        drift: drift({ data: { ok: false, reason: "unverified" } }),
      },
    ];
    expect(rollUpDeployment("tdd", targets).unknownCount).toBe(1);
  });

  it("does not count a still-loading check as unknown — pending is not 'could not run'", () => {
    const targets: DeploymentTarget[] = [
      {
        deployed: { status: "ready", names: ["tdd"], skippedCount: 0 },
        drift: drift({ data: undefined }),
      },
    ];
    expect(rollUpDeployment("tdd", targets).unknownCount).toBe(0);
  });

  it("flags checking while a deployed target's drift check is still running", () => {
    // Deploy-state can resolve before the drift check; a no-marks row must not
    // read as "confirmed up-to-date on every target" while a check is still in
    // flight (or stalled forever) — #272 invariant, J04.
    const targets: DeploymentTarget[] = [
      {
        deployed: { status: "ready", names: ["tdd"], skippedCount: 0 },
        drift: drift({ data: undefined }),
      },
    ];
    expect(rollUpDeployment("tdd", targets).checking).toBe(true);
  });

  it("is not checking once every deployed target's drift check has run", () => {
    expect(
      rollUpDeployment("tdd", [deployedTarget(["tdd"], [])]).checking,
    ).toBe(false);
  });

  it("never counts an up-to-date target as behind or unknown", () => {
    const rollup = rollUpDeployment("tdd", [deployedTarget(["tdd"], [])]);
    expect(rollup.behindCount).toBe(0);
    expect(rollup.unknownCount).toBe(0);
    expect(rollup.targetCount).toBe(1);
  });
});
