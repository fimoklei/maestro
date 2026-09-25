import { describe, expect, it } from "vitest";
import { toDeployedView, toolDeployedView } from "./deployed-view";
import type { DeployedPrimitive, SkippedEntry } from "./use-deploy-state";

type Response = { primitives: DeployedPrimitive[]; skipped: SkippedEntry[] };

const query = (state: {
  data?: Response;
  isError?: boolean;
}): { data: Response | undefined; isError: boolean } => ({
  data: state.data,
  isError: state.isError ?? false,
});

const skill = (name: string): DeployedPrimitive => ({
  type: "skill",
  name,
  version: "v0.5.0",
});

const skipped = (virtualPath: string): SkippedEntry => ({
  reason: "unsupported-type",
  virtualPath,
  packageType: "claude_hook",
});

describe("toDeployedView", () => {
  it("maps a read deploy-state to ready with its primitive names", () => {
    expect(
      toDeployedView(
        query({ data: { primitives: [skill("tdd")], skipped: [] } }),
      ),
    ).toEqual({
      status: "ready",
      names: ["tdd"],
      skippedCount: 0,
      attentionCount: 0,
    });
  });

  it("maps an empty deployment to ready with no names, not pending", () => {
    expect(
      toDeployedView(query({ data: { primitives: [], skipped: [] } })),
    ).toEqual({
      status: "ready",
      names: [],
      skippedCount: 0,
      attentionCount: 0,
    });
  });

  it("carries the skipped count so a skipped-only target is not read as empty", () => {
    expect(
      toDeployedView(
        query({
          data: { primitives: [], skipped: [skipped("hooks/pre-commit")] },
        }),
      ),
    ).toEqual({
      status: "ready",
      names: [],
      skippedCount: 1,
      attentionCount: 0,
    });
  });

  it("maps no data yet to pending", () => {
    expect(toDeployedView(query({ data: undefined }))).toEqual({
      status: "pending",
    });
  });

  it("maps a read error to unknown, never to a confirmed-empty deployment", () => {
    expect(toDeployedView(query({ isError: true }))).toEqual({
      status: "unknown",
    });
  });
});

describe("toolDeployedView", () => {
  it("maps a tool's names to ready when no read state is given", () => {
    expect(toolDeployedView(["tdd"])).toEqual({
      status: "ready",
      names: ["tdd"],
      skippedCount: 0,
      attentionCount: 0,
    });
  });

  it("maps a tool's names to ready on a successful global read", () => {
    expect(toolDeployedView(["tdd"], { data: {}, isError: false })).toEqual({
      status: "ready",
      names: ["tdd"],
      skippedCount: 0,
      attentionCount: 0,
    });
  });

  it("maps a failed global read to unknown, ignoring stale cached names", () => {
    expect(toolDeployedView(["tdd"], { data: {}, isError: true })).toEqual({
      status: "unknown",
    });
  });

  it("maps a not-yet-read global read to pending", () => {
    expect(toolDeployedView([], { data: undefined, isError: false })).toEqual({
      status: "pending",
    });
  });
});
