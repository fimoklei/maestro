import { homedir } from "node:os";
import {
  ApmCliDriver,
  type BrowseError,
  BrowseFilesystem,
  CheckVersionDrift,
  ConfigStore,
  ConnectInventory,
  type ConnectInventoryError,
  coreHealth,
  DeployedContentAdapter,
  DeploySkill,
  type DeploySkillError,
  DeployStateReader,
  InventoryGitAdapter,
  InventoryReader,
  NodeFileSystem,
  Registry,
  type RepoPathError,
  readGitOriginUrl,
  resolveApmGlobalRoot,
  resolveApmScratchCwd,
  resolveDeployedLockfilePath,
  resolveDeployedRoot,
  resolveInventoryPath,
  resolveMaestroConfigPath,
  ToolPresenceAdapter,
} from "@maestro/core";
import { Hono } from "hono";
import { z } from "zod";
import { originHostGuard } from "./origin-host-guard";

const registerBodySchema = z.object({ path: z.string() });

const connectBodySchema = z.object({ path: z.string() });

const browseBodySchema = z.object({ path: z.string() });

const deployBodySchema = z.object({
  // Any string passes the edge; "skills only" is a business rule in core, so
  // a non-skill type gets an honest 422 instead of a shape-level 400.
  type: z.string(),
  name: z.string(),
  // Discriminated target: a repo carries a path the registry gate validates in
  // core; global carries none, so no untrusted path crosses the boundary (J07).
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("repo"), repoPath: z.string() }),
    z.object({ kind: z.literal("global") }),
  ]),
  // The cockpit-confirmed reinstall. Validated at the edge as an optional
  // boolean; core treats it as the deliberate override of the destination guard
  // (ADR-0006, #66). Absent or false means the guard runs normally.
  force: z.boolean().optional(),
});

// A failed drift check answers 200 with a body the web maps to a badge, not an
// HTTP error (a screen reading "up-to-date" when the check failed would falsely
// reassure). `reason: "unverified"` — apm reached the tool but could not resolve
// against the remote — is forwarded so the cockpit shows "unverified" (an
// auth/network hint) rather than a bare "unknown"; a genuine failure omits it.
const driftFailureBody = (result: { reason?: "unverified" }) =>
  result.reason
    ? { ok: false as const, reason: result.reason }
    : { ok: false as const };

// Transport-layer mapping from the deploy use-case's typed errors to HTTP.
// Business rules live in core; this table only chooses status codes and
// readable messages (none of which echo paths or raw apm output).
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
    message: "The inventory clone has no readable origin remote.",
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
    // 409, not 502: the machine simply has no Claude Code or Codex to deploy to,
    // so there is nothing to install — a precondition the user resolves by
    // installing a tool, not an apm failure (ADR-0011, #131).
    status: 409,
    message:
      "No supported tool (Claude Code or Codex) was found on this machine, so there is nothing to deploy to globally.",
  },
  "auth-required": {
    // 502, not 401: the failure is between apm and GitHub, not an unauthorized
    // request to Maestro (#119).
    status: 502,
    message:
      "GitHub authentication is missing or expired. Run 'gh auth login' (or set GITHUB_TOKEN) and try again.",
  },
  "deploy-failed": {
    status: 502,
    message: "The deploy could not be completed. Check apm and try again.",
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

// Transport-layer mapping for the connect use-case. Path-shape failures are
// 400 (client sent a bad path); a real directory that simply is not an
// inventory is 422 (the request was well-formed but unprocessable). No message
// echoes the path — it may be a misconfigured secret.
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
};

// Transport-layer mapping for the browse use-case. outside-root is a 403 (the
// home-root ceiling refused it — the info-disclosure boundary), a missing path
// is 404, and a non-directory path is a 400 bad path. No message echoes the path
// — it may be a misconfigured secret (security.md).
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
  // Exists and is a directory, but its contents could not be read (e.g.
  // permission denied). 422: the request was well-formed but unprocessable.
  unreadable: {
    status: 422,
    message: "That directory could not be read.",
  },
};

// Builds the Hono app from injected dependencies so routes are testable in
// isolation (see tests/integration). The dependencies that reach the outside
// world — the registry and the Origin/Host enforcement — are passed in; tests
// construct them against temp dirs and with the guard disabled, production uses
// realDeps() below. server.ts attaches listening to the default `app`.

export type AppDeps = {
  registry: Registry;
  inventory: InventoryReader;
  connect: ConnectInventory;
  browse: BrowseFilesystem;
  deployState: DeployStateReader;
  deploy: DeploySkill;
  drift: CheckVersionDrift;
  // Resolves apm's user-scope (global) root server-side. No client-supplied path
  // reaches the global read; tests inject a sandbox so the real ~/.apm is never
  // touched (see .claude/rules/apm-driver.md).
  resolveGlobalRoot: () => string;
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

  // The currently configured inventory path (or null), for the Settings screen
  // to show what is connected and pre-fill the re-point field. A GET, so it
  // bypasses the Origin/Host guard. Unlike connect's error responses, returning
  // the user's own configured path to the local cockpit is intentional — it is
  // the same path the inventory read already uses, not an attacker probe.
  app.get("/api/inventory/config", async (c) => {
    return c.json({ inventoryPath: await deps.inventory.configuredPath() });
  });

  // Offline connect: persist a user-pasted path to an existing local
  // agent-harness clone as the inventory. A state-changing route, so the
  // app-wide Origin/Host guard above already covers it. No git clone (J11,
  // deferred per the job map).
  app.post("/api/inventory/connect", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = connectBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "invalid-body", message: "Expected a JSON body with a path." },
        400,
      );
    }

    const result = await deps.connect.connect(parsed.data.path);
    if (!result.ok) {
      const { status, message } = connectErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }

    // The primitive count is the connect confirmation's single source of
    // truth: re-read through the same InventoryReader the primitives route
    // uses, rather than counting independently (no second counting path to
    // drift out of sync). The connect above already persisted the new path —
    // that state change is done and real — so a failure in this *follow-up*
    // read (e.g. skills/ passed connect's is-a-directory check but turns out
    // unreadable, EACCES) must not turn an already-successful connect into a
    // 500. It degrades to a 0 count instead of failing the whole response.
    let primitiveCount = 0;
    try {
      const read = await deps.inventory.read();
      primitiveCount = read.ok ? read.primitives.length : 0;
    } catch {
      primitiveCount = 0;
    }

    return c.json({ inventoryPath: result.inventoryPath, primitiveCount });
  });

  // Read-only directory browser for the first-run path pickers (ADR-0009).
  // A POST, deliberately, so the app-wide Origin/Host guard above covers it:
  // this is MVP1's widest read surface and a GET would bypass that guard. The
  // home-root ceiling and all path safety live in core; this route only maps the
  // shape and the typed errors. An empty path lists the home root.
  app.post("/api/filesystem/children", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = browseBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "invalid-body", message: "Expected a JSON body with a path." },
        400,
      );
    }

    const result = await deps.browse.browse(parsed.data.path);
    if (!result.ok) {
      const { status, message } = browseErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }

    return c.json({ path: result.path, entries: result.entries });
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

  // Global (user-scope) deploy-state, grouped per detected tool (ADR-0011). The
  // server resolves apm's user-scope root itself, so no client path crosses the
  // boundary — any ?repo is ignored. The response carries the per-tool structure
  // plus the detected-tool set (implicit in `tools`), the single source the
  // cockpit reads. A missing global lockfile is an honest empty state (each
  // detected tool an empty group), never an error; a malformed one is a visible
  // 422, the same contract as the per-repo read.
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
          message:
            'Expected a JSON body with type, name, and target ({ kind: "repo", repoPath } or { kind: "global" }).',
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

  // Per-repo version drift, registry-gated like deploy-state. The judgment is
  // delegated to `apm outdated` (ADR-0001); each behind skill carries its
  // deployed -> latest version pair (ADR-0007), with the binary behind/up-to-date
  // judgment still derivable (latest !== current). A check that could not run is
  // a 200 with { ok: false } — a legitimate "unknown" the web maps to a badge,
  // not an HTTP error: a screen showing "up-to-date" when the check actually
  // failed would falsely reassure. Up-to-date is derived (check ran + skill not
  // behind), never read positively here.
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

  // Global version drift. The server sends no path to core — user-scope is
  // APM's global target, so any ?repo in the URL is ignored rather than trusted.
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
  // The per-repo read needs only fs; the global read groups per detected tool,
  // so it gets a live tool-presence probe against HOME (ADR-0011). The adapter's
  // default home resolution matches the deploy's, so `pnpm smoke` stays honest.
  const deployState = new DeployStateReader({
    fs,
    toolPresence: new ToolPresenceAdapter(),
  });
  // One apm driver, shared by deploy and drift. A global install/check runs
  // from a scratch dir under MAESTRO_HOME, created on demand so apm's .gitignore
  // side-effect never lands in a real repo (apm-driver.md, J07).
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
  // Owner/repo for package references come from the inventory clone's origin
  // remote, resolved per deploy so a path saved after startup is picked up.
  const deploy = new DeploySkill({
    inventory,
    registry,
    apm,
    inventoryGit: new InventoryGitAdapter({
      resolveRoot: async () =>
        resolveInventoryPath(await store.read(), process.env),
    }),
    // Destination guard: a repo's lockfile and deployed tree both sit in the
    // repo; a global deploy reads ~/.apm/apm.lock.yaml but deploys under HOME
    // (~/.claude/skills, ~/.agents/skills) where apm keys the hashes, so its two
    // roots differ. The resolution lives in core (apm-driver.md, #56/#61).
    deployedContent: new DeployedContentAdapter({
      resolveLockfilePath: (target) =>
        resolveDeployedLockfilePath(target, process.env),
      resolveDeployedRoot: (target) => resolveDeployedRoot(target, process.env),
    }),
    // Global tool presence: probe HOME live per deploy so a global install
    // targets only the tools the machine actually has (ADR-0011). The adapter's
    // default home resolution (process.env.HOME ?? homedir) already matches the
    // deploy's, so a sandbox HOME under `pnpm smoke` stays honest (ADR-0010).
    toolPresence: new ToolPresenceAdapter(),
    inventoryOriginUrl: async () => {
      const root = resolveInventoryPath(await store.read(), process.env);
      return root === undefined ? null : readGitOriginUrl(root);
    },
    canonicalPath: (path) => fs.realpath(path),
  });
  return {
    registry,
    inventory,
    connect: new ConnectInventory({ fs, store }),
    // The browse ceiling is the user's home directory (ADR-0009), resolved per
    // access so it is never frozen at import time.
    browse: new BrowseFilesystem({ fs, homeRoot: () => homedir() }),
    deployState,
    deploy,
    drift,
    resolveGlobalRoot: () => resolveApmGlobalRoot(process.env),
    enforceOriginHost: true,
  };
}

// Default composition root: existing health/wiring-smoke tests import { app }.
export const app = createApp(realDeps());
