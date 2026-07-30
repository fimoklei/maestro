import { homedir } from "node:os";
import {
  ApmCliDriver,
  type BrowseError,
  BrowseFilesystem,
  type BrowseSuccess,
  BulkDeploySkills,
  BulkRemoveDeployedSkill,
  CheckVersionDrift,
  ConfigStore,
  ConnectInventory,
  type ConnectInventoryError,
  coreHealth,
  DeployedCleanupAdapter,
  DeployedContentAdapter,
  DeployedLocation,
  DeployedRefAdapter,
  DeploySkill,
  type DeploySkillError,
  GlobalDeployStateReader,
  InFlightLocks,
  InventoryGitAdapter,
  InventoryReader,
  NodeFileSystem,
  Registry,
  RemoveDeployedSkill,
  type RemoveDeployedSkillError,
  type RemovePreflightError,
  type RepoPathError,
  readGitOriginUrl,
  resolveApmGlobalRoot,
  resolveApmScratchCwd,
  resolveInventoryPath,
  resolveMaestroConfigPath,
  ToolPresenceAdapter,
} from "@maestro/core";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { originHostGuard } from "./origin-host-guard";

const registerBodySchema = z.object({ path: z.string() });

const connectBodySchema = z.object({ path: z.string() });

const browseBodySchema = z.object({ path: z.string() });

// One spelling for every route that names a target: global carries no path, so
// no untrusted path crosses the boundary on it (J07).
const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("repo"), repoPath: z.string() }),
  z.object({ kind: z.literal("global") }),
]);

// Proves the confirmation came from this server's own preflight, not a
// client-built path list. Shaped as core mints it (allowlist, security.md).
const reclaimTokenSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .optional();

const deployBodySchema = z.object({
  // "skills only" is a core business rule, so a non-skill type is a 422, not a 400.
  type: z.string(),
  name: z.string(),
  target: targetSchema,
  // Deliberate override of the destination guard (ADR-0006, #66).
  force: z.boolean().optional(),
});

// No batch-wide force: a diverged copy always comes back as an attention row,
// overridden only per item via the single-deploy route (#292).
const bulkDeployBodySchema = z.object({
  names: z.array(z.string()).min(1),
  target: targetSchema,
});

const removeBodySchema = z.object({
  type: z.string(),
  name: z.string(),
  target: targetSchema,
  confirmedReclaimToken: reclaimTokenSchema,
});

const PATH_BODY_MESSAGE = "Expected a JSON body with a path.";

const TARGET_BODY_MESSAGE =
  'Expected a JSON body with type, name, and target ({ kind: "repo", repoPath } or { kind: "global" }).';

const BULK_BODY_MESSAGE =
  'Expected a JSON body with a non-empty names array and a target ({ kind: "repo", repoPath } or { kind: "global" }).';

// Every POST route's front door: unparsable JSON and a wrong shape are the
// same 400, so a route only supplies its schema and its own wording.
async function parseBody<T>(
  c: Context,
  schema: z.ZodType<T>,
  message: string,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const body = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: c.json({ error: "invalid-body", message }, 400),
    };
  }
  return { ok: true, data: parsed.data };
}

// A failed check is a 200 the web maps to a badge, never an HTTP error — a
// screen reading "up-to-date" when the check failed would falsely reassure.
const driftFailureBody = (result: { reason?: "unverified" }) =>
  result.reason
    ? { ok: false as const, reason: result.reason }
    : { ok: false as const };

// Business rules live in core; this table only chooses status codes and
// readable messages (none echo paths or raw apm output).
const deployErrorResponses: Record<
  DeploySkillError,
  { status: 400 | 403 | 404 | 409 | 422 | 502; message: string }
> = {
  "unsupported-primitive-type": {
    status: 422,
    message: "Only skills can be deployed yet.",
  },
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
    message:
      "The inventory clone's origin remote is missing, unreadable, or in a form apm cannot resolve. Maestro deploys from GitHub tags, so it needs a GitHub origin over https or ssh.",
  },
  "no-published-tag": {
    status: 422,
    message:
      "No published tag contains this skill. Tag and push the central harness first.",
  },
  "local-diverged-from-tag": {
    status: 409,
    message:
      "Your local skill differs from its latest published tag. Tag and push your change first.",
  },
  "deployed-diverged-from-lock": {
    status: 409,
    message:
      "The deployed copy has local changes that never went through central. Updating discards them and reinstalls at the latest tag.",
  },
  "deployed-unverifiable": {
    status: 409,
    message:
      "This copy predates content tracking, so local changes can't be checked. Updating reinstalls fresh at the latest tag; any local changes are discarded.",
  },
  "deployed-unreadable": {
    status: 409,
    message:
      "The deployed copy exists but could not be read. Check its permissions and that it is a directory, then try again.",
  },
  "lockfile-malformed": {
    status: 409,
    message:
      "The repo's lockfile (apm.lock.yaml) is present but could not be parsed. Fix or remove it, then try again.",
  },
  "deploy-in-progress": {
    status: 409,
    message: "A deploy to this repo is already running. Wait for it to finish.",
  },
  "no-supported-tool": {
    // 409, not 502: nothing to install is a precondition the user resolves,
    // not an apm failure (ADR-0011, #131).
    status: 409,
    message:
      "No supported tool (Claude Code or Codex) was found on this machine, so there is nothing to deploy to globally.",
  },
  "auth-required": {
    // 502, not 401: the failure is between apm and GitHub, not Maestro auth (#119).
    status: 502,
    message:
      "GitHub authentication is missing or expired. Run 'gh auth login' (or set GITHUB_TOKEN) and try again.",
  },
  "destination-symlinked": {
    // 409, not 502: apm refused on purpose — a conflict, not a failure (#180).
    status: 409,
    message:
      "The skill's destination directory is a symlink, and apm refuses to deploy into one. Replace that per-skill link with a real directory, or move the link one level up so the whole skills directory is the symlink (for example .claude/skills -> .agents/skills), then try again.",
  },
  "deploy-failed": {
    status: 502,
    message: "The deploy could not be completed. Check apm and try again.",
  },
};

const removeErrorResponses: Record<
  RemoveDeployedSkillError,
  { status: 400 | 403 | 404 | 409 | 422 | 502; message: string }
> = {
  "unsupported-primitive-type": {
    status: 422,
    message: "Only skills can be removed yet.",
  },
  "invalid-name": {
    status: 400,
    message: "Skill name must be a lowercase slug.",
  },
  "repo-not-registered": {
    status: 403,
    message: "That repo is not registered with Maestro.",
  },
  "no-supported-tool": {
    // 409, mirroring the deploy table (ADR-0011).
    status: 409,
    message:
      "No supported tool (Claude Code or Codex) was found on this machine, so there is no global deployment to remove.",
  },
  "not-deployed": {
    status: 404,
    message:
      "That skill is not deployed on this target, so there is nothing to remove.",
  },
  "lockfile-malformed": {
    status: 409,
    message:
      "The repo's lockfile (apm.lock.yaml) is present but could not be parsed, so Maestro cannot tell apm what to remove. Fix or remove it, then try again.",
  },
  "ref-unresolvable": {
    status: 409,
    message:
      "The lockfile entry for this skill does not name it the way a Maestro deploy would, so the package reference apm needs cannot be trusted to point at it. Remove it with apm directly.",
  },
  "deployed-unreadable": {
    status: 409,
    message:
      "The deployed copy exists but could not be read, so Maestro cannot tell whether removing it would delete local changes. Check its permissions and that it is a directory, then try again.",
  },
  "remove-in-progress": {
    status: 409,
    message:
      "Another change to this repo is already running. Wait for it to finish.",
  },
  "remove-failed": {
    // 502: apm ran and didn't prove removal, so the outcome is unknown.
    status: 502,
    message: "apm did not confirm the removal. Check apm and try again.",
  },
};

// A failed check is an error, never an empty warning — the cockpit must tell
// "nothing to lose" apart from "we could not look".
const removePreflightErrorResponses: Record<
  RemovePreflightError,
  { status: 400 | 403 | 404 | 409 | 422 | 502; message: string }
> = {
  "unsupported-primitive-type":
    removeErrorResponses["unsupported-primitive-type"],
  "invalid-name": removeErrorResponses["invalid-name"],
  "repo-not-registered": removeErrorResponses["repo-not-registered"],
  "no-supported-tool": removeErrorResponses["no-supported-tool"],
  "preflight-failed": {
    status: 502,
    message:
      "Maestro could not check the deployed copy for local changes. Check the repo's permissions and try again.",
  },
};

// Exhaustive by construction: the table above is keyed by the error union
// itself, so a new refusal cannot be missing from the allowlist.
const refusalCodes = Object.keys(removePreflightErrorResponses) as [
  RemovePreflightError,
  ...RemovePreflightError[],
];

// One skill, many targets — the mirror image of the bulk-deploy body. Each
// target carries its own preflight answer: the token that authorises its
// reclaim, or the allowlisted code that takes it out of the run.
const bulkRemoveBodySchema = z.object({
  name: z.string(),
  targets: z
    .array(
      z.object({
        target: targetSchema,
        confirmedReclaimToken: reclaimTokenSchema,
        refused: z.enum(refusalCodes).optional(),
      }),
    )
    .min(1),
});

const repoPathErrorMessages: Record<
  RepoPathError | "central-inventory",
  string
> = {
  missing: "Path is required.",
  relative: "Path must be an absolute path.",
  "not-found": "No directory exists at that path.",
  "not-a-directory": "That path is not a directory.",
  "central-inventory":
    "The central inventory cannot be registered as a consuming repo.",
};

// Path-shape failures are 400; a real directory that isn't an inventory is
// 422. No message echoes the path — it may be a misconfigured secret.
const connectErrorResponses: Record<
  ConnectInventoryError,
  { status: 400 | 422; message: string }
> = {
  missing: { status: 400, message: repoPathErrorMessages.missing },
  relative: { status: 400, message: repoPathErrorMessages.relative },
  "not-found": { status: 400, message: repoPathErrorMessages["not-found"] },
  "not-a-directory": {
    status: 400,
    message: repoPathErrorMessages["not-a-directory"],
  },
  "not-an-inventory": {
    status: 422,
    message: "That directory has no skills/ folder, so it is not an inventory.",
  },
  "no-usable-origin": {
    status: 422,
    message:
      "That folder has skills/, but its git origin is missing, unreadable, or in a form apm cannot resolve. Deploys read versions from GitHub tags, so point Maestro at a clone whose origin is a GitHub repo over https or ssh.",
  },
};

// outside-root is 403 (the info-disclosure boundary); no message echoes the
// path (security.md).
const browseErrorResponses: Record<
  BrowseError,
  { status: 400 | 403 | 404 | 422; message: string }
> = {
  "outside-root": {
    status: 403,
    message: "That path is outside the area Maestro can browse.",
  },
  "not-found": { status: 404, message: "No directory exists at that path." },
  "not-a-directory": {
    status: 400,
    message: "That path is not a directory.",
  },
  // In bounds and a directory, but unreadable — 422, not 403/404.
  unreadable: {
    status: 422,
    message: "That directory could not be read.",
  },
};

// Built from injected dependencies so routes are testable in isolation
// (tests/integration). Production uses realDeps() below.
export type AppDeps = {
  registry: Registry;
  inventory: InventoryReader;
  connect: ConnectInventory;
  browse: BrowseFilesystem;
  // Serves both per-repo and global routes, so tool presence is required —
  // omitting it is a compile error here, not a 500 discovered later (#187).
  deployState: GlobalDeployStateReader;
  deploy: DeploySkill;
  remove: RemoveDeployedSkill;
  drift: CheckVersionDrift;
  // Tests inject a sandbox so the real ~/.apm is never touched (apm-driver.md).
  resolveGlobalRoot: () => string;
  // Production always enables the guard; tests construct it disabled. No
  // static bypass header.
  enforceOriginHost: boolean;
};

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.get("/api/health", (c) => c.json(coreHealth()));

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

  app.get("/api/inventory/primitives", async (c) => {
    const result = await deps.inventory.read();
    if (!result.ok) {
      // 409: unset/missing/not-a-directory. Never echoes the path.
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

  // A GET, so it bypasses the Origin/Host guard — returning the user's own
  // configured path is intentional, not an attacker probe.
  app.get("/api/inventory/config", async (c) => {
    return c.json({ inventoryPath: await deps.inventory.configuredPath() });
  });

  // Offline connect: persist a user-pasted path as the inventory. No git
  // clone (J11, deferred).
  app.post("/api/inventory/connect", async (c) => {
    const body = await parseBody(c, connectBodySchema, PATH_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.connect.connect(body.data.path);
    if (!result.ok) {
      const { status, message } = connectErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }

    // Re-read through the same InventoryReader the primitives route uses, so
    // the two can't drift. A failure here must not turn an already-successful
    // connect into a 500 — degrades to 0 instead.
    let primitiveCount = 0;
    try {
      const read = await deps.inventory.read();
      primitiveCount = read.ok ? read.primitives.length : 0;
    } catch {
      primitiveCount = 0;
    }

    return c.json({ inventoryPath: result.inventoryPath, primitiveCount });
  });

  // Read-only directory browser (ADR-0009). POST deliberately, so the guard
  // above covers this widest read surface — a GET would bypass it.
  app.post("/api/filesystem/children", async (c) => {
    const body = await parseBody(c, browseBodySchema, PATH_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.browse.browse(body.data.path);
    if (!result.ok) {
      const { status, message } = browseErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }

    // `parent` undefined at the home ceiling → JSON.stringify drops the key,
    // which is the "up is disabled" contract. `satisfies` binds this to core's
    // shape so a field added there fails to compile here, not arrives undefined (#156).
    return c.json({
      path: result.path,
      parent: result.parent,
      breadcrumbs: result.breadcrumbs,
      entries: result.entries,
    } satisfies BrowseSuccess);
  });

  // Registry-gated: an unregistered repo is refused before any filesystem
  // access, so a request can never read an arbitrary <path>/apm.lock.yaml.
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
      // 422: lockfile exists but couldn't be read — never a silent empty list.
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

  // Grouped per detected tool (ADR-0011). Server resolves the root itself —
  // any ?repo is ignored. Missing lockfile is an honest empty state; malformed is 422.
  app.get("/api/deploy-state/global", async (c) => {
    const result = await deps.deployState.readGlobal(deps.resolveGlobalRoot());
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          message: "The global lockfile could not be read.",
        },
        422,
      );
    }
    return c.json({ tools: result.tools, skipped: result.skipped });
  });

  // Business rules live in core; this route validates shape and maps errors.
  app.post("/api/deploy", async (c) => {
    const body = await parseBody(c, deployBodySchema, TARGET_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.deploy.execute(body.data);
    if (!result.ok) {
      const { status, message } = deployErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }
    return c.json({ deployed: result.deployed });
  });

  app.post("/api/deploy/remove", async (c) => {
    const body = await parseBody(c, removeBodySchema, TARGET_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.remove.execute(body.data);
    if (!result.ok) {
      const { status, message } = removeErrorResponses[result.error];
      // Omitted, never null: a failure that never reached apm has no outcome,
      // and an absent key cannot be mistaken for one the server proved (#416).
      return c.json(
        {
          error: result.error,
          message,
          ...(result.outcome ? { outcome: result.outcome } : {}),
        },
        status,
      );
    }
    return c.json({ removed: result.removed });
  });

  // Never a silent "clean" on a failed check — it answers with its own error (#337).
  app.post("/api/deploy/remove/preflight", async (c) => {
    const body = await parseBody(c, removeBodySchema, TARGET_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.remove.preflight(body.data);
    if (!result.ok) {
      const { status, message } = removePreflightErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }
    return c.json({ check: result.check, reclaim: result.reclaim });
  });

  // Always 200 with a report — a per-skill refusal is data, not an HTTP error.
  // Shares the deploy use-case's per-target in-flight lock (#292).
  const bulkDeploy = new BulkDeploySkills({ deploy: deps.deploy });
  app.post("/api/deploy/bulk", async (c) => {
    const body = await parseBody(c, bulkDeployBodySchema, BULK_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const report = await bulkDeploy.execute(body.data);
    return c.json(report);
  });

  // Always 200 with a report — one target's refusal is data, not an HTTP error.
  // The walk delegates to the same remove use-case the single route drives, so
  // every guard, the per-target lock and the reclaim contract stay there (#421).
  const bulkRemove = new BulkRemoveDeployedSkill({ remove: deps.remove });
  app.post("/api/deploy/remove/bulk", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = bulkRemoveBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "invalid-body",
          message:
            'Expected a JSON body with a name and a non-empty targets array, each entry carrying a target ({ kind: "repo", repoPath } or { kind: "global" }).',
        },
        400,
      );
    }

    const report = await bulkRemove.execute(parsed.data);
    return c.json(report);
  });

  // Registry-gated like deploy-state. Delegated to `apm outdated` (ADR-0001).
  app.get("/api/drift", async (c) => {
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
    const result = await deps.drift.execute({
      target: { kind: "repo", repoPath: repo },
    });
    if (!result.ok) {
      return c.json(driftFailureBody(result));
    }
    return c.json({ behind: result.behind });
  });

  // No path sent to core — user-scope is apm's global target; any ?repo is ignored.
  app.get("/api/drift/global", async (c) => {
    const result = await deps.drift.execute({
      target: { kind: "global" },
    });
    if (!result.ok) {
      return c.json(driftFailureBody(result));
    }
    return c.json({ behind: result.behind });
  });

  app.get("/api/registry/repos", async (c) =>
    c.json({ repos: await deps.registry.list() }),
  );

  app.post("/api/registry/repos", async (c) => {
    const body = await parseBody(c, registerBodySchema, PATH_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.registry.register(body.data.path);
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
  // Resolved per access, not at import: importing { app } must not freeze
  // the config path to load-time env.
  const store = new ConfigStore({
    fs,
    configPath: () => resolveMaestroConfigPath(process.env),
  });
  const registry = new Registry({
    fs,
    store,
    resolveCentralInventoryPath: (config) =>
      resolveInventoryPath(config, process.env),
  });
  // Resolved per read, so a path saved after startup is picked up without a restart.
  const inventory = new InventoryReader({
    fs,
    resolvePath: async () =>
      resolveInventoryPath(await store.read(), process.env),
  });
  const deployState = new GlobalDeployStateReader({
    fs,
    toolPresence: new ToolPresenceAdapter(),
  });
  // Runs from a scratch dir under MAESTRO_HOME, created on demand, so apm's
  // .gitignore side-effect never lands in a real repo (apm-driver.md, J07).
  const apm = new ApmCliDriver({
    prepareGlobalCwd: async () => {
      const cwd = resolveApmScratchCwd(process.env);
      await fs.ensureDir(cwd);
      return cwd;
    },
  });
  const drift = new CheckVersionDrift({
    registry,
    apm,
    canonicalPath: (path) => fs.realpath(path),
  });
  // Shared instance: a global deploy's lockfile root and deploy tree differ
  // (~/.apm vs ~/.claude/skills, apm-driver.md #56/#61) — guard and cleanup agree by construction.
  const deployedLocation = new DeployedLocation(process.env);
  // Shared by deploy and remove: both rewrite the same apm.lock.yaml, and a
  // deploy racing a remove would corrupt it.
  const apmWriteLocks = new InFlightLocks();
  const deploy = new DeploySkill({
    inventory,
    registry,
    apm,
    inventoryGit: new InventoryGitAdapter({
      resolveRoot: async () =>
        resolveInventoryPath(await store.read(), process.env),
    }),
    deployedContent: new DeployedContentAdapter({ location: deployedLocation }),
    // Reconciles an untargeted tool's leftover copy after a narrowed global
    // deploy (ADR-0011, #136) — a direct subtree rm, never `apm uninstall -g`.
    deployedCleanup: new DeployedCleanupAdapter({ location: deployedLocation }),
    // Live HOME probe per deploy, so a global install targets only tools the
    // machine actually has (ADR-0011).
    toolPresence: new ToolPresenceAdapter(),
    inventoryOriginUrl: async () => {
      const root = resolveInventoryPath(await store.read(), process.env);
      return root === undefined ? null : readGitOriginUrl(root);
    },
    canonicalPath: (path) => fs.realpath(path),
    locks: apmWriteLocks,
  });
  // Same DeployedLocation as deploy, so guard/cleanup/reclaim always agree on
  // which lockfile and tree a target means.
  const remove = new RemoveDeployedSkill({
    registry,
    deployedRef: new DeployedRefAdapter({ fs, location: deployedLocation }),
    // apm deletes an edited file silently — a removal must prove nothing to
    // lose first (apm-driver.md § Remove).
    deployedContent: new DeployedContentAdapter({ location: deployedLocation }),
    apm,
    // For copies apm's uninstall can't reach: a tool this machine no longer detects (#339).
    deployedCleanup: new DeployedCleanupAdapter({ location: deployedLocation }),
    toolPresence: new ToolPresenceAdapter(),
    canonicalPath: (path) => fs.realpath(path),
    locks: apmWriteLocks,
    location: deployedLocation,
  });
  return {
    registry,
    inventory,
    // Checked offline against local git config, so the error lands before
    // the first deploy (#147).
    connect: new ConnectInventory({ fs, store, originUrl: readGitOriginUrl }),
    browse: new BrowseFilesystem({ fs, homeRoot: () => homedir() }),
    deployState,
    deploy,
    remove,
    drift,
    resolveGlobalRoot: () => resolveApmGlobalRoot(process.env),
    enforceOriginHost: true,
  };
}

export const app = createApp(realDeps());
