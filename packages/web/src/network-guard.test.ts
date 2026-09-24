// Guards the refusing fetch that vitest.setup.ts installs for the web lane.
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("refuses an unstubbed fetch instead of reaching the network", async () => {
  await expect(fetch("/api/inventory")).rejects.toThrow(
    "The web test lane has no network: stub fetch in the test.",
  );
});

it("still refuses once a test's own fetch stub is removed", async () => {
  vi.stubGlobal("fetch", vi.fn());
  vi.unstubAllGlobals();

  await expect(fetch("/api/inventory")).rejects.toThrow(
    "The web test lane has no network",
  );
});
