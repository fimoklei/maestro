import { composeUseCases, nodeUseCasePorts } from "@maestro/core";
import { Hono } from "hono";
import type { AppDeps } from "./app-deps";
import { originHostGuard } from "./origin-host-guard";
import { registerCategoryRoutes } from "./routes/category-routes";
import { registerDeployRoutes } from "./routes/deploy-routes";
import { registerFolderRoutes } from "./routes/folder-routes";
import { registerHarnessAuthoringRoutes } from "./routes/harness-authoring-routes";
import { registerHarnessRoutes } from "./routes/harness-routes";
import { registerInventoryRoutes } from "./routes/inventory-routes";

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true, component: "server" }));

  // App-wide, so a new write route is protected by default.
  if (deps.enforceOriginHost) {
    const safeMethods = new Set(["GET", "HEAD"]);
    app.use("*", async (c, next) => {
      if (safeMethods.has(c.req.method)) {
        return next();
      }
      return originHostGuard(c, next);
    });
  }

  registerInventoryRoutes(app, deps);
  registerHarnessRoutes(app, deps);
  registerHarnessAuthoringRoutes(app, deps);
  registerFolderRoutes(app, deps);
  registerDeployRoutes(app, deps);
  registerCategoryRoutes(app, deps);

  return app;
}

// The env object, not a copy: a MAESTRO_HOME set after import is still read.
export const app = createApp({
  ...composeUseCases(nodeUseCasePorts(process.env)),
  enforceOriginHost: true,
});
