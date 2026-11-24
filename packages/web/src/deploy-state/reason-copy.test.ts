import { describe, expect, it } from "vitest";
import { REASON } from "./reason-copy";

describe("the reasons that name a failed read", () => {
  it("says what Maestro couldn't read", () => {
    expect(REASON["inventory-unreadable"]).toBe("Couldn't read the Inventory");
    expect(REASON["deployed-unreadable"]).toBe(
      "Couldn't read the deployed copy",
    );
    expect(REASON["lockfile-malformed"]).toBe(
      "Couldn't read the deployment record",
    );
  });
});
