import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import { bulkRemoveTargets } from "./bulk-remove-targets";
import type { DeploymentTarget } from "./deployed-rollup";
import type { DeployTarget } from "./use-deploy-skill";

const drift = driftViewModel({ data: { behind: [] }, isError: false });

const ready = (
  target: DeployTarget,
  names: string[],
  label = "",
  version = "v1.0.0",
): DeploymentTarget => ({
  label,
  target,
  deployed: { status: "ready", names, skippedCount: 0, attentionCount: 0 },
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

  // A row has one line for a name, and deep clones share a long prefix — the
  // tail is the part that tells two of them apart (#211).
  it("shortens a repo path to the tail that tells it from its siblings", () => {
    expect(
      bulkRemoveTargets("tdd", [
        ready(
          repo("/home/me/work/acme-web"),
          ["tdd"],
          "/home/me/work/acme-web",
        ),
        ready(
          repo("/home/me/play/acme-web"),
          ["tdd"],
          "/home/me/play/acme-web",
        ),
      ]).map((entry) => entry.label),
    ).toEqual(["…/work/acme-web", "…/play/acme-web"]);
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
