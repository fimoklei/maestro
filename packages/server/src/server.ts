import { serve } from "@hono/node-server";
import { app } from "./app";
import { bindConfig } from "./bind-config";

const { port, hostname } = bindConfig(process.env);

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`Maestro server listening on http://${hostname}:${info.port}`);
});
