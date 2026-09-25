import { serve } from "@hono/node-server";
import { bindConfig } from "@maestro/core";
import { app } from "./app";

const { port, hostname } = bindConfig();

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`Maestro server listening on http://${hostname}:${info.port}`);
});
