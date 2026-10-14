import { app } from "@maestro/server";
import { describe, expect, it } from "vitest";

// Integration lane: drives the real Hono app via app.request, proving the
// server answers its reachability probe.
describe("GET /api/health", () => {
  it("reports the cockpit server as healthy", async () => {
    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, component: "server" });
  });
});
