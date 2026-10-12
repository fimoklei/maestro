import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import type { DeploymentTarget } from "../inventory/deployed-rollup";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { readyView } from "../test-utils";
import { bulkRemoveTargets } from "./bulk-remove-targets";

const drift = driftViewModel({ data: { behind: [] }, isError: false });

const ready = (
  target: DeployTarget,
  names: string[],
  label = "",
  version = "v1.0.0",
): DeploymentTarget => ({
  pending: undefined,
  label,
  target,
  deployed: readyView(names),
  primitives: names.map((name) => ({
    type: "skill" as const,
    name,
    version,
  })),
  drift,
});

const unread = (
  target: DeployTarget,
  status: "pending" | "unknown",
): DeploymentTarget => ({
  pending: undefined,
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
        ready(repo("/dev/acme-web"), ["tdd"], "/dev/acme-web"),
      ]).map((entry) => entry.target),
    ).toEqual([{ kind: "global" }, repo("/dev/acme-web")]);
  });

  it("leaves out a target the skill is not deployed to", () => {
    expect(
      bulkRemoveTargets("tdd", [
        ready({ kind: "global" }, ["caveman"]),
        ready(repo("/dev/acme-web"), ["tdd"]),
      ]).map((entry) => entry.target),
    ).toEqual([repo("/dev/acme-web")]);
  });

  it("leaves out a target whose deploy-state has not been read", () => {
    expect(
      bulkRemoveTargets("tdd", [
        unread({ kind: "global" }, "pending"),
        unread(repo("/dev/acme-web"), "unknown"),
      ]),
    ).toEqual([]);
  });

  // apm's uninstall has no -t: one global removal covers every tool, so the
  // pane's per-tool rows are one entry in the run.
  it("folds global's per-tool rows into one global target", () => {
    expect(
      bulkRemoveTargets("tdd", [
        ready({ kind: "global" }, ["tdd"], "Claude Code"),
        ready({ kind: "global" }, ["tdd"], "Codex"),
        ready(repo("/dev/acme-web"), ["tdd"], "/dev/acme-web"),
      ]).map((entry) => entry.target),
    ).toEqual([{ kind: "global" }, repo("/dev/acme-web")]);
  });

  // The confirmation names a target and the version it is about to destroy
  // (#423), and both are already on the pane row this list is folded from.
  it("carries each target's label and the version deployed there", () => {
    expect(
      bulkRemoveTargets("tdd", [
        ready(repo("/dev/acme-web"), ["tdd"], "/dev/acme-web", "v1.2.0"),
      ]),
    ).toEqual([
      {
        target: repo("/dev/acme-web"),
        label: "/dev/acme-web",
        version: "v1.2.0",
      },
    ]);
  });

  // The list names each repo as its pane row does: shortened against every
  // registered repository, not only the ones holding the skill (#1476).
  it("names a repo with the target's own short name", () => {
    expect(
      bulkRemoveTargets("tdd", [
        ready(
          repo("/home/me/clientA/repos/agent-harness"),
          ["tdd"],
          "…/clientA/repos/agent-harness",
        ),
      ]).map((entry) => entry.label),
    ).toEqual(["…/clientA/repos/agent-harness"]);
  });

  // One removal covers every tool, so no single tool's name describes it —
  // borrowing the first row's label would name a target the run does not have.
  it("names the folded global target for the removal it is, not for a tool", () => {
    expect(
      bulkRemoveTargets("tdd", [
        ready({ kind: "global" }, ["tdd"], "Claude Code", "v1.0.0"),
        ready({ kind: "global" }, ["tdd"], "Codex", "v1.0.0"),
      ]),
    ).toEqual([
      { target: { kind: "global" }, label: "Global", version: "v1.0.0" },
    ]);
  });
});
