import { describe, expect, it } from "vitest";
import { toDeployedView, toolDeployedView } from "./deployed-view";
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
  reason: "unsupported-type",
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

describe("toolDeployedView", () => {
  it("maps a tool's names to ready when no read state is given", () => {
    // The global-targets cards only render a tool once the read succeeded (their
    // container gates the error state), so a bare names call is always ready.
    expect(toolDeployedView(["tdd"])).toEqual({
      status: "ready",
      names: ["tdd"],
      skippedCount: 0,
    });
  });

  it("maps a tool's names to ready on a successful global read", () => {
    expect(toolDeployedView(["tdd"], { data: {}, isError: false })).toEqual({
      status: "ready",
      names: ["tdd"],
      skippedCount: 0,
    });
  });

  it("maps a failed global read to unknown, ignoring stale cached names", () => {
    // TanStack keeps the last-good tools after a refetch fails; marking those
    // stale names "ready" would let a tool read "in sync"/▲N from data the read
    // could no longer confirm — the J04 lie. A failed read is unknown.
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
