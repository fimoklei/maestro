import { describe, expect, it } from "vitest";
import type { GlobalDeployStateReader } from "./deploy-state-reader";
import { TargetSelectionAdapter } from "./target-selection";

// The reader's own result shapes, so a fake answer that could not come out of
// the real read fails to compile.
type Reader = Pick<GlobalDeployStateReader, "read" | "readGlobal">;

const head = (release: string) => ({
  release,
  latestRelease: "v0.3.4",
  changed: 1,
  selected: 2,
  comparedAt: null,
});

const skill = (name: string, version = "v0.3.2") =>
  ({ type: "skill", name, version }) as const;

function adapter(reader: Partial<Reader>) {
  return new TargetSelectionAdapter({
    deployState: {
      read:
        reader.read ??
        (async () => ({ ok: true, primitives: [], skipped: [] })),
      readGlobal:
        reader.readGlobal ??
        (async () => ({
          ok: true,
          tools: [],
          skipped: [],
          otherOrigins: [],
        })),
    },
    globalRoot: () => "/apm",
  });
}

describe("TargetSelectionAdapter", () => {
  it("reads a repository's release and every skill deployed under it", async () => {
    const result = await adapter({
      read: async () => ({
        ok: true,
        primitives: [skill("tdd"), skill("grill")],
        skipped: [],
        releaseHead: head("v0.3.2"),
      }),
    }).read({ kind: "repo", repoPath: "/repo" });

    expect(result).toStrictEqual({
      ok: true,
      release: "v0.3.2",
      selection: ["tdd", "grill"],
    });
  });

  it("reads the global target as one Selection across every detected tool", async () => {
    const result = await adapter({
      readGlobal: async () => ({
        ok: true,
        tools: [
          {
            tool: "claude",
            primitives: [skill("tdd"), skill("grill")],
            releaseHead: head("v0.3.2"),
          },
          {
            tool: "codex",
            primitives: [skill("tdd")],
            releaseHead: head("v0.3.2"),
          },
        ],
        skipped: [],
        otherOrigins: [],
      }),
    }).read({ kind: "global" });

    expect(result).toStrictEqual({
      ok: true,
      release: "v0.3.2",
      selection: ["tdd", "grill"],
    });
  });

  it("reports a target following no single release as nothing deployed", async () => {
    const result = await adapter({
      read: async () => ({ ok: true, primitives: [skill("tdd")], skipped: [] }),
    }).read({ kind: "repo", repoPath: "/repo" });

    expect(result).toStrictEqual({ ok: false, reason: "not-deployed" });
  });

  it("reports an unreadable deployment record as malformed", async () => {
    const result = await adapter({
      read: async () => ({ ok: false, error: "malformed" }),
    }).read({ kind: "repo", repoPath: "/repo" });

    expect(result).toStrictEqual({ ok: false, reason: "lockfile-malformed" });
  });
});
