import {
  ConfigStore,
  coreHealth,
  InventoryReader,
  NodeFileSystem,
  Registry,
  type RepoPathError,
  resolveInventoryPath,
  resolveMaestroConfigPath,
} from "@maestro/core";
import { Hono } from "hono";
import { z } from "zod";
import { originHostGuard } from "./origin-host-guard";

const registerBodySchema = z.object({ path: z.string() });

// Transport-layer mapping from the domain's typed validation errors to readable
// text the cockpit shows next to the path field.
const repoPathErrorMessages: Record<RepoPathError, string> = {
  missing: "Path is required.",
  relative: "Path must be an absolute path.",
  "not-found": "No directory exists at that path.",
  "not-a-directory": "That path is not a directory.",
};

// Builds the Hono app from injected dependencies so routes are testable in
// isolation (see tests/integration). The dependencies that reach the outside
// world — the registry and the Origin/Host enforcement — are passed in; tests
// construct them against temp dirs and with the guard disabled, production uses
// realDeps() below. server.ts attaches listening to the default `app`.

export type AppDeps = {
  registry: Registry;
  inventory: InventoryReader;
  // Production always enables the Origin/Host guard on write routes; tests
  // construct it disabled. There is no static bypass header.
  enforceOriginHost: boolean;
};

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.get("/api/health", (c) => c.json(coreHealth()));

  // Guard every state-changing method app-wide, so a new write route is
  // protected by default instead of safe-only-if-the-author-remembers. Safe
  // methods (GET/HEAD) are never state-changing and pass straight through.
  if (deps.enforceOriginHost) {
    const safeMethods = new Set(["GET", "HEAD"]);
    app.use("*", async (c, next) => {
      if (safeMethods.has(c.req.method)) {
        return next();
      }
      return originHostGuard(c, next);
    });
  }

  app.get("/api/inventory/primitives", async (c) => {
    const result = await deps.inventory.read();
    if (!result.ok) {
      // 409: the inventory path is unset / missing / not a directory. The
      // message never echoes the path — it may be a misconfigured secret.
      return c.json(
        {
          error: result.error,
          message:
            "No inventory is configured. Set the agent-harness clone path.",
        },
        409,
      );
    }
    return c.json({ primitives: result.primitives });
  });

  app.get("/api/registry/repos", async (c) =>
    c.json({ repos: await deps.registry.list() }),
  );

  app.post("/api/registry/repos", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = registerBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "invalid-body",
          message: "Expected a JSON body with a path.",
        },
        400,
      );
    }

    const result = await deps.registry.register(parsed.data.path);
    if (!result.ok) {
      return c.json(
        { error: result.error, message: repoPathErrorMessages[result.error] },
        400,
      );
    }

    return c.json({ repos: result.repos }, 201);
  });

  return app;
}

function realDeps(): AppDeps {
  const fs = new NodeFileSystem();
  // Resolve MAESTRO_HOME per access, not at import: importing { app } must not
  // freeze the config path to whatever env happened to be set at load time.
  const store = new ConfigStore({
    fs,
    configPath: () => resolveMaestroConfigPath(process.env),
  });
  const registry = new Registry({ fs, store });
  // Resolve the inventory path per read (config wins, else MAESTRO_INVENTORY_PATH)
  // so a path saved after startup is picked up without a restart.
  const inventory = new InventoryReader({
    fs,
    resolvePath: async () =>
      resolveInventoryPath(await store.read(), process.env),
  });
  return { registry, inventory, enforceOriginHost: true };
}

// Default composition root: existing health/wiring-smoke tests import { app }.
export const app = createApp(realDeps());
