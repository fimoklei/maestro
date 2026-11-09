import type { FolderOutcomes } from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  type BulkDeployRunState,
  ranWith,
  redeployedIn,
} from "./bulk-deploy-run-state";

const plan = { toDeploy: ["tdd", "grill"], skippedClean: ["review"] };
const firstRead: FolderOutcomes = { release: "v1.0.0", folders: [] };
const secondRead: FolderOutcomes = { release: "v1.1.0", folders: [] };

describe("bulk deploy run state", () => {
  it("starts a run with no row deployed again and no folders read back", () => {
    expect(ranWith(plan)).toEqual({
      phase: "ran",
      plan,
      redeployed: [],
      reread: null,
    });
  });

  it("adds a row's Deploy again and takes the folders it read back", () => {
    const run = redeployedIn(
      ranWith(plan),
      { name: "tdd", version: "1.0.0" },
      firstRead,
    );
    expect(run).toEqual({
      phase: "ran",
      plan,
      redeployed: [{ name: "tdd", version: "1.0.0" }],
      reread: firstRead,
    });
  });

  it("keeps the last folders read when a Deploy again reads none back", () => {
    const once = redeployedIn(
      ranWith(plan),
      { name: "tdd", version: "1.0.0" },
      firstRead,
    );
    const twice = redeployedIn(
      once,
      { name: "grill", version: "1.1.0" },
      undefined,
    );
    expect(twice).toMatchObject({
      redeployed: [
        { name: "tdd", version: "1.0.0" },
        { name: "grill", version: "1.1.0" },
      ],
      reread: firstRead,
    });
    expect(
      redeployedIn(twice, { name: "review", version: "1.1.0" }, secondRead),
    ).toMatchObject({ reread: secondRead });
  });

  it("ignores a Deploy again that lands after the run was left", () => {
    const choosing: BulkDeployRunState = { phase: "choosing" };
    expect(
      redeployedIn(choosing, { name: "tdd", version: "1.0.0" }, firstRead),
    ).toBe(choosing);
  });
});
