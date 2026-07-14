import { describe, expect, it } from "vitest";
import { toDeployedView } from "./deployed-view";
import type { DeployedPrimitive, SkippedEntry } from "./use-deploy-state";

type Response = { primitives: DeployedPrimitive[]; skipped: SkippedEntry[] };

// The query-state the mapper reads: just the two fields toDeployedView uses.
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
  virtualPath,
  packageType: "hook",
});

describe("toDeployedView", () => {
  it("maps a read deploy-state to ready with its primitive names", () => {
    expect(
      toDeployedView(
        query({ data: { primitives: [skill("tdd")], skipped: [] } }),
      ),
    ).toEqual({ status: "ready", names: ["tdd"], skippedCount: 0 });
  });

  it("maps an empty deployment to ready with no names, not pending", () => {
    expect(
      toDeployedView(query({ data: { primitives: [], skipped: [] } })),
    ).toEqual({
      status: "ready",
      names: [],
      skippedCount: 0,
    });
  });

  it("carries the skipped count so a skipped-only target is not read as empty", () => {
    // Zero primitives but a non-empty skipped set is not an empty deployment —
    // the roll-up needs the count to keep such a target off the "empty" reading.
    expect(
      toDeployedView(
        query({
          data: { primitives: [], skipped: [skipped("hooks/pre-commit")] },
        }),
      ),
    ).toEqual({ status: "ready", names: [], skippedCount: 1 });
  });

  it("maps no data yet to pending", () => {
    expect(toDeployedView(query({ data: undefined }))).toEqual({
      status: "pending",
    });
  });

  it("maps a read error to unknown, never to a confirmed-empty deployment", () => {
    // The J04 failure mode: a failed read must read as unknown, never as a
    // ready+empty set that the roll-up would join into a false "in sync".
    expect(toDeployedView(query({ isError: true }))).toEqual({
      status: "unknown",
    });
  });
});
