import { serve } from "@hono/node-server";
import { app } from "./app";

// Compositie-wortel: hangt het luisteren aan de testbare app uit app.ts.
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Maestro-server luistert op http://localhost:${info.port}`);
});
