import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import type { ReadDriftEntry } from "../drift/use-drift";
import { chosenBulkDeployTargets } from "./bulk-deploy-targets";

function drift(behind: ReadDriftEntry[] = []) {
  return driftViewModel({ data: { behind }, isError: false });
}

describe("chosenBulkDeployTargets", () => {
  it("stays pending for Global until the global deploy-state read resolves", () => {
    const d = drift();

    const targets = chosenBulkDeployTargets({
      isGlobal: true,
      target: { kind: "global" },
      targetLabel: "Global",
      globalTools: undefined,
      repoPrimitives: undefined,
      drift: d,
    });

    expect(targets).toEqual([
      {
        label: "Global",
        target: { kind: "global" },
        deployed: { status: "pending" },
        primitives: [],
        drift: d,
      },
    ]);
  });

  it("builds one target per detected tool for a Global run", () => {
    const targets = chosenBulkDeployTargets({
      isGlobal: true,
      target: { kind: "global" },
      targetLabel: "Global",
      globalTools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v1.0.0" }],
        },
        { tool: "codex", primitives: [] },
      ],
      repoPrimitives: undefined,
      drift: drift(),
    });

    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({
      deployed: {
        status: "ready",
        names: ["tdd"],
        skippedCount: 0,
        attentionCount: 0,
      },
    });
    expect(targets[1]).toMatchObject({
      deployed: {
        status: "ready",
        names: [],
        skippedCount: 0,
        attentionCount: 0,
      },
    });
  });

  it("narrows drift to each tool's own skills for a Global run", () => {
    const targets = chosenBulkDeployTargets({
      isGlobal: true,
      target: { kind: "global" },
      targetLabel: "Global",
      globalTools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v1.0.0" }],
        },
      ],
      repoPrimitives: undefined,
      drift: drift([
        { name: "tdd", current: "v1.0.0", latest: "v1.2.0", reading: "behind" },
      ]),
    });

    const [target] = targets;
    expect(target?.drift.skillStatus("tdd")).toBe("behind");
  });

  it("stays pending for a repo target until its deploy-state read resolves", () => {
    const d = drift();

    const targets = chosenBulkDeployTargets({
      isGlobal: false,
      target: { kind: "repo", repoPath: "/dev/acme-web" },
      targetLabel: "/repo",
      globalTools: undefined,
      repoPrimitives: undefined,
      drift: d,
    });

    expect(targets).toEqual([
      {
        label: "/repo",
        target: { kind: "repo", repoPath: "/dev/acme-web" },
        deployed: { status: "pending" },
        primitives: [],
        drift: d,
      },
    ]);
  });

  // The plan reads the Release head first (#956), so the target carries it.
  it("carries each target's Release head into the plan", () => {
    const head = {
      release: "v0.3.2",
      latestRelease: "v0.3.4",
      changed: 1,
      changedSkills: ["tdd"],
      selected: 1,
      comparedAt: "2026-09-12T10:00:00.000Z",
    };
    const global = chosenBulkDeployTargets({
      isGlobal: true,
      target: { kind: "global" },
      targetLabel: "Global",
      globalTools: [{ tool: "claude", primitives: [], releaseHead: head }],
      repoPrimitives: undefined,
      drift: drift(),
    });
    const repo = chosenBulkDeployTargets({
      isGlobal: false,
      target: { kind: "repo", repoPath: "/dev/acme-web" },
      targetLabel: "/repo",
      globalTools: undefined,
      repoPrimitives: [],
      repoReleaseHead: head,
      drift: drift(),
    });

    expect(global[0]?.releaseHead).toEqual(head);
    expect(repo[0]?.releaseHead).toEqual(head);
  });

  it("builds one ready target for a repo run", () => {
    const d = drift();

    const targets = chosenBulkDeployTargets({
      isGlobal: false,
      target: { kind: "repo", repoPath: "/dev/acme-web" },
      targetLabel: "/repo",
      globalTools: undefined,
      repoPrimitives: [{ type: "skill", name: "tdd", version: "v1.0.0" }],
      drift: d,
    });

    expect(targets).toEqual([
      {
        label: "/repo",
        target: { kind: "repo", repoPath: "/dev/acme-web" },
        deployed: {
          status: "ready",
          names: ["tdd"],
          skippedCount: 0,
          attentionCount: 0,
        },
        primitives: [{ type: "skill", name: "tdd", version: "v1.0.0" }],
        drift: d,
      },
    ]);
  });
});
