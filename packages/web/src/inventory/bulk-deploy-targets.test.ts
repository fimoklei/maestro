import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import type { VersionDrift } from "../drift/use-drift";
import { chosenBulkDeployTargets } from "./bulk-deploy-targets";

function drift(behind: VersionDrift[] = []) {
  return driftViewModel({ data: { behind }, isError: false });
}

describe("chosenBulkDeployTargets", () => {
  it("stays pending for Global until the global deploy-state read resolves", () => {
    const d = drift();

    const targets = chosenBulkDeployTargets({
      isGlobal: true,
      targetLabel: "Global",
      globalTools: undefined,
      repoPrimitives: undefined,
      drift: d,
    });

    expect(targets).toEqual([
      {
        label: "Global",
        deployed: { status: "pending" },
        primitives: [],
        drift: d,
      },
    ]);
  });

  it("builds one target per detected tool for a Global run", () => {
    const targets = chosenBulkDeployTargets({
      isGlobal: true,
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
      deployed: { status: "ready", names: ["tdd"], skippedCount: 0 },
    });
    expect(targets[1]).toMatchObject({
      deployed: { status: "ready", names: [], skippedCount: 0 },
    });
  });

  it("narrows drift to each tool's own skills for a Global run", () => {
    const targets = chosenBulkDeployTargets({
      isGlobal: true,
      targetLabel: "Global",
      globalTools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v1.0.0" }],
        },
      ],
      repoPrimitives: undefined,
      drift: drift([{ name: "tdd", current: "v1.0.0", latest: "v1.2.0" }]),
    });

    const [target] = targets;
    expect(target?.drift.skillStatus("tdd")).toBe("behind");
  });

  it("stays pending for a repo target until its deploy-state read resolves", () => {
    const d = drift();

    const targets = chosenBulkDeployTargets({
      isGlobal: false,
      targetLabel: "/repo",
      globalTools: undefined,
      repoPrimitives: undefined,
      drift: d,
    });

    expect(targets).toEqual([
      {
        label: "/repo",
        deployed: { status: "pending" },
        primitives: [],
        drift: d,
      },
    ]);
  });

  it("builds one ready target for a repo run", () => {
    const d = drift();

    const targets = chosenBulkDeployTargets({
      isGlobal: false,
      targetLabel: "/repo",
      globalTools: undefined,
      repoPrimitives: [{ type: "skill", name: "tdd", version: "v1.0.0" }],
      drift: d,
    });

    expect(targets).toEqual([
      {
        label: "/repo",
        deployed: { status: "ready", names: ["tdd"], skippedCount: 0 },
        primitives: [{ type: "skill", name: "tdd", version: "v1.0.0" }],
        drift: d,
      },
    ]);
  });
});
