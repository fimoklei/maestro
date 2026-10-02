import type { ReadDriftEntry } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
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
      globalState: undefined,
      repoRead: { data: undefined, isError: false },
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
      globalState: {
        tools: [
          {
            tool: "claude",
            primitives: [{ type: "skill", name: "tdd", version: "v1.0.0" }],
          },
          { tool: "codex", primitives: [] },
        ],
        skipped: [],
      },
      repoRead: { data: undefined, isError: false },
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
      globalState: {
        tools: [
          {
            tool: "claude",
            primitives: [{ type: "skill", name: "tdd", version: "v1.0.0" }],
          },
        ],
        skipped: [],
      },
      repoRead: { data: undefined, isError: false },
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
      globalState: undefined,
      repoRead: { data: undefined, isError: false },
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
      globalState: {
        tools: [{ tool: "claude", primitives: [], releaseHead: head }],
        skipped: [],
      },
      repoRead: { data: undefined, isError: false },
      drift: drift(),
    });
    const repo = chosenBulkDeployTargets({
      isGlobal: false,
      target: { kind: "repo", repoPath: "/dev/acme-web" },
      targetLabel: "/repo",
      globalState: undefined,
      repoRead: {
        data: { primitives: [], skipped: [], releaseHead: head },
        isError: false,
      },
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
      globalState: undefined,
      repoRead: {
        data: {
          primitives: [{ type: "skill", name: "tdd", version: "v1.0.0" }],
          skipped: [],
        },
        isError: false,
      },
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

  // The bar and the table read the same global state, so they report the same
  // attention count for the same target (#792).
  it("carries the attention count the table shows", () => {
    const unmanageable = {
      reason: "unmanageable-skill" as const,
      virtualPath: "skills/tdd",
      packageType: "claude_skill",
    };
    const global = chosenBulkDeployTargets({
      isGlobal: true,
      target: { kind: "global" },
      targetLabel: "Global",
      globalState: {
        tools: [{ tool: "claude", primitives: [] }],
        skipped: [unmanageable],
      },
      repoRead: { data: undefined, isError: false },
      drift: drift(),
    });
    const repo = chosenBulkDeployTargets({
      isGlobal: false,
      target: { kind: "repo", repoPath: "/dev/acme-web" },
      targetLabel: "/repo",
      globalState: undefined,
      repoRead: {
        data: { primitives: [], skipped: [unmanageable] },
        isError: false,
      },
      drift: drift(),
    });

    expect(global[0]?.deployed).toMatchObject({ attentionCount: 1 });
    expect(repo[0]?.deployed).toMatchObject({ attentionCount: 1 });
  });
});
