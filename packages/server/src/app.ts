import {
  ConfigStore,
  coreHealth,
  NodeFileSystem,
  Registry,
  type RepoPathError,
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
  // Production always enables the Origin/Host guard on write routes; tests
  // construct it disabled. There is no static bypass header.
  enforceOriginHost: boolean;
};

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.get("/api/health", (c) => c.json(coreHealth()));

  // Guard the write routes only; reads are not state-changing.
  if (deps.enforceOriginHost) {
    app.use("/api/registry/repos", async (c, next) => {
      if (c.req.method !== "POST") {
        return next();
      }
      return originHostGuard(c, next);
    });
  }

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
  const configPath = resolveMaestroConfigPath(process.env);
  const registry = new Registry({
    fs,
    store: new ConfigStore({ fs, configPath }),
  });
  return { registry, enforceOriginHost: true };
}

// Default composition root: existing health/wiring-smoke tests import { app }.
export const app = createApp(realDeps());
