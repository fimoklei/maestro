import {
  ApmCliDriver,
  ConfigStore,
  coreHealth,
  DeploySkill,
  type DeploySkillError,
  DeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
  type RepoPathError,
  readGitOriginUrl,
  resolveInventoryPath,
  resolveMaestroConfigPath,
} from "@maestro/core";
import { Hono } from "hono";
import { z } from "zod";
import { originHostGuard } from "./origin-host-guard";

const registerBodySchema = z.object({ path: z.string() });

const deployBodySchema = z.object({
  type: z.literal("skill"),
  name: z.string(),
  repoPath: z.string(),
});

// Transport-layer mapping from the deploy use-case's typed errors to HTTP.
// Business rules live in core; this table only chooses status codes and
// readable messages (none of which echo paths or raw apm output).
const deployErrorResponses: Record<
  DeploySkillError,
  { status: 400 | 403 | 404 | 409 | 502; message: string }
> = {
  "invalid-name": {
    status: 400,
    message: "Skill name must be a lowercase slug.",
  },
  "unknown-skill": {
    status: 404,
    message: "That skill is not in the inventory.",
  },
  "inventory-not-configured": {
    status: 409,
    message: "No inventory is configured. Set the agent-harness clone path.",
  },
  "repo-not-registered": {
    status: 403,
    message: "That repo is not registered with Maestro.",
  },
  "inventory-origin-unavailable": {
    status: 502,
    message: "The inventory clone has no readable origin remote.",
  },
  "no-deployable-tag": {
    status: 409,
    message: "The inventory has no published version tag to deploy.",
  },
};

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
  deployState: DeployStateReader;
  deploy: DeploySkill;
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

  // Per-repo deploy-state, registry-gated: a repo not in the registry is
  // refused before any filesystem access, so a local request can never read an
  // arbitrary <path>/apm.lock.yaml. The version returned is the human tag, never
  // a commit hash (DeployStateReader owns that).
  app.get("/api/deploy-state", async (c) => {
    const repo = c.req.query("repo");
    if (repo === undefined || repo.trim() === "") {
      return c.json(
        { error: "missing-repo", message: "A repo path is required." },
        400,
      );
    }
    if (!(await deps.registry.isRegistered(repo))) {
      return c.json(
        {
          error: "not-registered",
          message: "That repo is not registered with Maestro.",
        },
        403,
      );
    }
    const result = await deps.deployState.read(repo);
    if (!result.ok) {
      // 422: the lockfile exists but could not be read. An empty list must
      // never stand in for "I couldn't read this".
      return c.json(
        {
          error: result.error,
          message: "The repo's lockfile could not be read.",
        },
        422,
      );
    }
    return c.json({ primitives: result.primitives, skipped: result.skipped });
  });

  // Deploy a skill into a registered repo. All business rules (slug check,
  // inventory membership, registry gate, tag resolution) live in the core
  // use-case; this route validates the body shape and maps typed errors.
  app.post("/api/deploy", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = deployBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "invalid-body",
          message: "Expected a JSON body with type, name, and repoPath.",
        },
        400,
      );
    }

    const result = await deps.deploy.execute(parsed.data);
    if (!result.ok) {
      const { status, message } = deployErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }
    return c.json({ deployed: result.deployed });
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
  const deployState = new DeployStateReader({ fs });
  // Owner/repo for package references come from the inventory clone's origin
  // remote, resolved per deploy so a path saved after startup is picked up.
  const deploy = new DeploySkill({
    inventory,
    registry,
    apm: new ApmCliDriver(),
    inventoryOriginUrl: async () => {
      const root = resolveInventoryPath(await store.read(), process.env);
      return root === undefined ? null : readGitOriginUrl(root);
    },
  });
  return { registry, inventory, deployState, deploy, enforceOriginHost: true };
}

// Default composition root: existing health/wiring-smoke tests import { app }.
export const app = createApp(realDeps());
