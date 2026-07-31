import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import { bulkRemoveTargets } from "./bulk-remove-targets";
import type { DeploymentTarget } from "./deployed-rollup";
import type { DeployTarget } from "./use-deploy-skill";

const drift = driftViewModel({ data: { behind: [] }, isError: false });

const ready = (target: DeployTarget, names: string[]): DeploymentTarget => ({
  label: "",
  target,
  deployed: { status: "ready", names, skippedCount: 0 },
  primitives: names.map((name) => ({
    type: "skill" as const,
    name,
    version: "v1.0.0",
  })),
  drift,
});

const unread = (
  target: DeployTarget,
  status: "pending" | "unknown",
): DeploymentTarget => ({
  label: "",
  target,
  deployed: { status },
  primitives: [],
  drift,
});

const repo = (repoPath: string): DeployTarget => ({ kind: "repo", repoPath });

describe("bulkRemoveTargets", () => {
  it("lists every target holding the skill, in the order the pane shows them", () => {
    expect(
      bulkRemoveTargets("tdd", [
        ready({ kind: "global" }, ["tdd"]),
        ready(repo("/dev/acme-web"), ["tdd"]),
      ]),
    ).toEqual([{ kind: "global" }, repo("/dev/acme-web")]);
  });

  it("leaves out a target the skill is not deployed to", () => {
    expect(
      bulkRemoveTargets("tdd", [
        ready({ kind: "global" }, ["caveman"]),
        ready(repo("/dev/acme-web"), ["tdd"]),
      ]),
    ).toEqual([repo("/dev/acme-web")]);
  });

  it("leaves out a target whose deploy-state has not been read (J04)", () => {
    expect(
      bulkRemoveTargets("tdd", [
        unread({ kind: "global" }, "pending"),
        unread(repo("/dev/acme-web"), "unknown"),
      ]),
    ).toEqual([]);
  });

  // apm's uninstall has no -t: one global removal covers every tool, so the
  // pane's per-tool rows are one entry in the run (ADR-0013).
  it("folds global's per-tool rows into one global target", () => {
    expect(
      bulkRemoveTargets("tdd", [
        ready({ kind: "global" }, ["tdd"]),
        ready({ kind: "global" }, ["tdd"]),
        ready(repo("/dev/acme-web"), ["tdd"]),
      ]),
    ).toEqual([{ kind: "global" }, repo("/dev/acme-web")]);
  });
});
