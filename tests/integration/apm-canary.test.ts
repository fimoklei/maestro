// Needs network and auth to the private agent-harness repo, so it runs only
// with MAESTRO_REAL_APM=1 (#14). Lacking either it fails loudly.
import { ApmCliDriver } from "@maestro/core";
import { describe, expect, it } from "vitest";

const enabled = process.env.MAESTRO_REAL_APM === "1";

describe.runIf(enabled)("real apm canary", () => {
  it("resolves a latest tag of shape vX.Y.Z from the live versions table", {
    timeout: 30_000,
  }, async () => {
    const driver = new ApmCliDriver();
    const result = await driver.resolveLatestTag("fimoklei/agent-harness");
    expect(result.ok).toBe(true);
    if (!result.ok)
      throw new Error(`expected a resolved tag, got ${result.reason}`);
    expect(result.tag).toMatch(/^v\d+\.\d+\.\d+$/);
  });
});

describe.runIf(!enabled)("real apm canary (skipped)", () => {
  it("is disabled without MAESTRO_REAL_APM=1", () => {
    expect(enabled).toBe(false);
  });
});
