import { describe, expect, it } from "vitest";
import type { SkippedEntry } from "../deploy-state/use-deploy-state";
import { driftViewModel } from "../drift/drift-view-model";
import { globalToolTargets, repoTarget } from "./deployment-target-rows";

const drift = driftViewModel({ data: { behind: [] }, isError: false });
const skill = { type: "skill" as const, name: "tdd", version: "v1.0.0" };
const unmanageable: SkippedEntry = {
  reason: "unmanageable-skill",
  virtualPath: "skills/tdd",
  packageType: "claude_skill",
};

describe("globalToolTargets", () => {
  it("builds one global row per detected tool", () => {
    const rows = globalToolTargets(
      { tools: [{ tool: "claude", primitives: [skill] }], skipped: [] },
      drift,
    );

    expect(rows).toEqual([
      {
        label: "Claude Code",
        target: { kind: "global" },
        tool: "claude",
        deployed: {
          status: "ready",
          names: ["tdd"],
          skippedCount: 0,
          attentionCount: 0,
        },
        primitives: [skill],
        drift: expect.anything(),
      },
    ]);
  });

  it("puts the section-wide attention count on every tool row", () => {
    const rows = globalToolTargets(
      {
        tools: [
          { tool: "claude", primitives: [skill] },
          { tool: "codex", primitives: [] },
        ],
        skipped: [unmanageable],
      },
      drift,
    );

    expect(rows.map((row) => row.deployed)).toEqual([
      expect.objectContaining({ status: "ready", attentionCount: 1 }),
      expect.objectContaining({ status: "ready", attentionCount: 1 }),
    ]);
  });
});

describe("repoTarget", () => {
  const target = { kind: "repo" as const, repoPath: "/dev/acme-web" };

  it("counts the skipped entries that need attention", () => {
    const row = repoTarget({
      label: "acme-web",
      target,
      read: {
        data: { primitives: [skill], skipped: [unmanageable] },
        isError: false,
      },
      drift,
    });

    expect(row.deployed).toEqual({
      status: "ready",
      names: ["tdd"],
      skippedCount: 1,
      attentionCount: 1,
    });
  });

  it("reads pending before the read lands and unknown after it fails", () => {
    const read = (isError: boolean) =>
      repoTarget({
        label: "acme-web",
        target,
        read: { data: undefined, isError },
        drift,
      });

    expect(read(false).deployed).toEqual({ status: "pending" });
    expect(read(true).deployed).toEqual({ status: "unknown" });
  });
});
