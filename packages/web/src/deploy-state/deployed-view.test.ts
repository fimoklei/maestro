import { describe, expect, it } from "vitest";
import { toDeployedView } from "./deployed-view";
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
