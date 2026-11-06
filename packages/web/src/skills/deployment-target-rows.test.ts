import type { GlobalFolderState, SkippedEntry } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import {
  globalTargets,
  globalToolTargets,
  repoTarget,
} from "./deployment-target-rows";

const drift = driftViewModel({ data: { behind: [] }, isError: false });
const skill = { type: "skill" as const, name: "tdd", version: "v1.0.0" };
const unmanageable: SkippedEntry = {
  reason: "unmanageable-skill",
  virtualPath: "skills/tdd",
  packageType: "claude_skill",
};

const folder = (
  tool: "claude" | "codex",
  primitives: (typeof skill)[],
  detected = true,
): GlobalFolderState => ({
  path: tool === "claude" ? "~/.claude/skills" : "~/.agents/skills",
  tool,
  detected,
  primitives,
});

describe("globalTargets", () => {
  it("builds one Global row with its one skill list and the folders it writes", () => {
    const rows = globalTargets(
      {
        primitives: [skill],
        folders: [folder("claude", [skill]), folder("codex", [], false)],
        skipped: [],
      },
      drift,
    );

    expect(rows).toEqual([
      {
        label: "Global",
        target: { kind: "global" },
        folders: ["~/.claude/skills"],
        deployed: {
          status: "ready",
          names: ["tdd"],
          skippedCount: 0,
          attentionCount: 0,
          followsRelease: false,
        },
        primitives: [skill],
        drift: expect.anything(),
      },
    ]);
  });

  it("builds no row while no tool is detected", () => {
    const rows = globalTargets(
      {
        primitives: [],
        folders: [folder("claude", [], false), folder("codex", [], false)],
        skipped: [],
      },
      drift,
    );

    expect(rows).toEqual([]);
  });

  it("carries the global target's unfinished operation and attention count", () => {
    const [row] = globalTargets(
      {
        primitives: [skill],
        folders: [folder("claude", [skill]), folder("codex", [skill])],
        skipped: [unmanageable],
        pendingOperation: { kind: "remove", release: "v1.0.0", desired: [] },
      },
      drift,
    );

    expect(row?.pending).toBe("remove");
    expect(row?.deployed).toEqual(
      expect.objectContaining({ status: "ready", attentionCount: 1 }),
    );
  });
});

describe("globalToolTargets", () => {
  it("builds one global row per folder of a detected tool", () => {
    const rows = globalToolTargets(
      {
        folders: [folder("claude", [skill]), folder("codex", [], false)],
        skipped: [],
      },
      drift,
    );

    expect(rows).toEqual([
      {
        label: "Claude Code",
        target: { kind: "global" },
        deployed: {
          status: "ready",
          names: ["tdd"],
          skippedCount: 0,
          attentionCount: 0,
          followsRelease: false,
        },
        primitives: [skill],
        drift: expect.anything(),
      },
    ]);
  });

  it("carries the global target's unfinished operation onto every tool row", () => {
    const rows = globalToolTargets(
      {
        folders: [folder("claude", [skill]), folder("codex", [skill])],
        skipped: [],
        pendingOperation: { kind: "remove", release: "v1.0.0", desired: [] },
      },
      drift,
    );

    expect(rows.map((row) => row.pending)).toEqual(["remove", "remove"]);
  });

  it("puts the section-wide attention count on every tool row", () => {
    const rows = globalToolTargets(
      {
        folders: [folder("claude", [skill]), folder("codex", [])],
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
      followsRelease: false,
    });
  });

  it("carries the repository's unfinished operation", () => {
    const row = repoTarget({
      label: "acme-web",
      target,
      read: {
        data: {
          primitives: [skill],
          skipped: [],
          pendingOperation: {
            kind: "update",
            release: "v1.1.0",
            desired: ["tdd"],
          },
        },
        isError: false,
      },
      drift,
    });

    expect(row.pending).toBe("update");
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
