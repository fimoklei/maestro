import { describe, expect, it } from "vitest";
import { toDeployedView } from "./deployed-view";
import type { DeployedPrimitive } from "./use-deploy-state";

type Response = { primitives: DeployedPrimitive[] };

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

describe("toDeployedView", () => {
  it("maps a read deploy-state to ready with its primitive names", () => {
    expect(
      toDeployedView(query({ data: { primitives: [skill("tdd")] } })),
    ).toEqual({ status: "ready", names: ["tdd"] });
  });

  it("maps an empty deployment to ready with no names, not pending", () => {
    expect(toDeployedView(query({ data: { primitives: [] } }))).toEqual({
      status: "ready",
      names: [],
    });
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
