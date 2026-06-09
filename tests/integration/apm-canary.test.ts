// The real-apm canary (issue #14 / apm-driver.md): proves the driver and the
// versions-table parser still match reality. It shells out to the real apm CLI
// and needs network plus auth to the private agent-harness repo, so it is
// gated behind MAESTRO_REAL_APM=1 and stays out of the fast loop. Lacking
// network or auth it fails loudly — the intended stop-and-report.
import { ApmCliDriver } from "@maestro/core";
import { describe, expect, it } from "vitest";

const enabled = process.env.MAESTRO_REAL_APM === "1";

describe.runIf(enabled)("real apm canary", () => {
  it("resolves a latest tag of shape vX.Y.Z from the live versions table", {
    timeout: 30_000,
  }, async () => {
    const driver = new ApmCliDriver();
    const tag = await driver.resolveLatestTag("fimoklei/agent-harness");
    expect(tag).toMatch(/^v\d+\.\d+\.\d+$/);
  });
});

describe.runIf(!enabled)("real apm canary (skipped)", () => {
  it("is disabled without MAESTRO_REAL_APM=1", () => {
    expect(enabled).toBe(false);
  });
});
