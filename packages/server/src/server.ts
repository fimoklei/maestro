import { serve } from "@hono/node-server";
import { app } from "./app";

// Composition root: attaches listening to the testable app from app.ts. Binds
// 127.0.0.1 only — never 0.0.0.0 — so the cockpit is unreachable from the
// network (see .claude/rules/security.md).
const port = Number(process.env.PORT ?? 3000);
const hostname = "127.0.0.1";

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`Maestro server listening on http://${hostname}:${info.port}`);
});
