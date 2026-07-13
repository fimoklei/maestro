import type { DeployedPrimitive } from "../deploy-state/use-deploy-state";
import { deriveSyncedState } from "./derive-synced-state";
import type { DriftView } from "./drift-status";

const deployed = (names: string[]): DeployedPrimitive[] =>
  names.map((name) => ({ type: "skill", name, version: "v0.5.1" }));

describe("deriveSyncedState", () => {
  it("reports synced when the skill is deployed and its version is up-to-date", () => {
    expect(
      deriveSyncedState(
        deployed(["tdd"]),
        { status: "ready", behind: [] },
        "tdd",
      ),
    ).toBe("synced");
  });

  it("reports not-synced when the skill is not deployed", () => {
    expect(
      deriveSyncedState(deployed([]), { status: "ready", behind: [] }, "tdd"),
    ).toBe("not-synced");
  });

  it("reports not-synced when the deployed skill is behind", () => {
    expect(
      deriveSyncedState(
        deployed(["tdd"]),
        {
          status: "ready",
          behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }],
        },
        "tdd",
      ),
    ).toBe("not-synced");
  });

  it.each<DriftView>([
    { status: "pending" },
    { status: "unknown" },
    { status: "unverified" },
  ])("reports not-synced until drift is proven up-to-date (%o)", (drift) => {
    expect(deriveSyncedState(deployed(["tdd"]), drift, "tdd")).toBe(
      "not-synced",
    );
  });

  it("reports not-synced before deploy-state has resolved", () => {
    expect(
      deriveSyncedState(undefined, { status: "ready", behind: [] }, "tdd"),
    ).toBe("not-synced");
  });
});
