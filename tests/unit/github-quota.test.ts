import { describe, expect, it } from "vitest";
import { checkQuota } from "../../scripts/github-quota.mjs";

const RESET = Date.UTC(2026, 8, 30, 22, 6, 17) / 1000;

function answering(remaining: number) {
  return async () => ({
    ok: true,
    json: async () => ({ resources: { core: { remaining, reset: RESET } } }),
  });
}

describe("checkQuota", () => {
  it("passes when the anonymous quota covers the run", async () => {
    const result = await checkQuota(60, answering(60));

    expect(result).toEqual({ ok: true, remaining: 60, resetAt: "22:06:17Z" });
  });

  it("fails with the reset time when the quota falls short", async () => {
    const result = await checkQuota(60, answering(12));

    expect(result).toEqual({ ok: false, remaining: 12, resetAt: "22:06:17Z" });
  });

  it("fails closed when GitHub cannot answer", async () => {
    const result = await checkQuota(1, async () => {
      throw new Error("offline");
    });

    expect(result).toEqual({ ok: false, remaining: null, resetAt: null });
  });
});
