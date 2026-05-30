import { app } from "@maestro/server";
import { describe, expect, it } from "vitest";

// Integratiebaan: drijft de echte Hono-app via app.request, bewijst de server-API
// én de bedrading server -> core (de health-payload komt uit coreHealth()).
describe("GET /api/health", () => {
  it("reports the cockpit server as healthy", async () => {
    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, component: "core" });
  });
});
