import { coreHealth } from "@maestro/core";
import { Hono } from "hono";

// Bouwt de Hono-app zonder te luisteren, zodat de routes los testbaar zijn
// (zie tests/integration). De server-entry (server.ts) hangt het luisteren eraan.
export const app = new Hono();

app.get("/api/health", (c) => c.json(coreHealth()));
