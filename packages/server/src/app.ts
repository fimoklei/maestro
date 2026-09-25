import { homedir } from "node:os";
import {
  ApmCliDriver,
  CheckVersionDrift,
  ChooseFolder,
  ConfigStore,
  ConnectInventory,
  CopySkillFolder,
  DeleteLocalSkill,
  DeployedCleanupAdapter,
  DeployedContentAdapter,
  DeployedLocation,
  DeployedRefAdapter,
  DeploySkill,
  GhCliAdapter,
  GitCloneAdapter,
  GitHarnessScaffoldAdapter,
  GlobalDeployStateReader,
  HarnessFreshnessStore,
  HarnessGitAdapter,
  ImportSkill,
  InFlightLocks,
  InventoryGitAdapter,
  InventoryReader,
  isRepositoryRoot,
  LocalCopyGuard,
  MacosFolderChooser,
  NodeCopyTreeFs,
  NodeFileSystem,
  PromoteSkill,
  PromoteSkillDeletion,
  ProposalActions,
  PublishRelease,
  parseGitOrigin,
  probeHead,
  ReadDrift,
  ReadHarnessState,
  RecordedPackageAdapter,
  Registry,
  ReleaseHeadReader,
  RemoveDeployedSkill,
  RestoreSkill,
  RetryTargetOperation,
  readConfiguredGitOriginUrl,
  readGitHubPage,
  readGitOriginUrl,
  releasedSkillsFromGit,
  resolveApmGlobalRoot,
  resolveApmScratchCwd,
  resolveDefaultBranch,
  resolveInventoryPath,
  resolveMaestroConfigPath,
  ScaffoldHarness,
  ScaffoldOffers,
  SelectionWriter,
  TargetOperationStore,
  ToolPresenceAdapter,
  UpdateTarget,
} from "@maestro/core";
import { Hono } from "hono";
import type { AppDeps } from "./app-deps";
import { originHostGuard } from "./origin-host-guard";
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
  const harnessGit = new HarnessGitAdapter();
  const inventory = new InventoryReader({
    fs,
    resolvePath: async () =>
      resolveInventoryPath(await store.read(), process.env),
    originUrl: readConfiguredGitOriginUrl,
    readReleasedSkills: releasedSkillsFromGit(harnessGit),
  });
  const harnessRoot = async () => {
    const path = resolveInventoryPath(await store.read(), process.env);
    if (path === undefined) {
      return undefined;
    }
    // A path git cannot be pointed at is a harness that is not connected —
    // never the raw path, which would run git against something unresolved.
    return await fs.realpath(path).catch(() => undefined);
  };
  // Shared instance, so guard and cleanup agree on a global deploy's lockfile root and tree.
  const deployedLocation = new DeployedLocation(process.env);
  const deployState = new GlobalDeployStateReader({
    fs,
    toolPresence: new ToolPresenceAdapter(),
    treeRoot: () => deployedLocation.treeRoot({ kind: "global" }),
    releaseHead: new ReleaseHeadReader({
      git: harnessGit,
      resolveRoot: harnessRoot,
      now: () => new Date(),
    }),
    harnessOrigin: async () => {
      const root = await harnessRoot();
      return root === undefined ? null : await harnessGit.readOrigin(root);
    },
    content: new DeployedContentAdapter({ location: deployedLocation }),
    // Read per request, not captured at construction: the retry use-case is
    // built further down, and the record it reads changes with every write.
    operations: { pending: (target) => retryOperation.pending(target) },
    githubPage: readGitHubPage,
    // What a target's release and skills link to (#1181).
    harnessPage: async () => {
      const root = await harnessRoot();
      return root === undefined ? null : await readGitHubPage(root);
    },
  });
  // A scratch dir under MAESTRO_HOME, so apm's .gitignore edit never lands in a real repo.
  const apm = new ApmCliDriver({
    prepareGlobalCwd: async () => {
      const cwd = resolveApmScratchCwd(process.env);
      await fs.ensureDir(cwd);
      return cwd;
    },
  });
  // Optional: without gh or its sign-in, only the review stage degrades.
  const harnessReview = new GhCliAdapter();
  const harnessFreshness = new HarnessFreshnessStore({ store });
  // Shared by both ways a movement reaches review: two of them for the same
  // harness must queue, not race each other's temporary index and push.
  const harnessPromoteLocks = new InFlightLocks();

  const drift = new ReadDrift({
    drift: new CheckVersionDrift({
      registry,
      apm,
      canonicalPath: (path) => fs.realpath(path),
    }),
    fs,
    location: deployedLocation,
    resolveRoot: harnessRoot,
    git: harnessGit,
  });
  // Shared by deploy and remove: both rewrite the same apm.lock.yaml, and a
  // deploy racing a remove would corrupt it.
  const apmWriteLocks = new InFlightLocks();
  const inventoryGit = new InventoryGitAdapter({
    resolveRoot: async () =>
      resolveInventoryPath(await store.read(), process.env),
  });
  const copyGuard = new LocalCopyGuard({
    content: new DeployedContentAdapter({
      location: deployedLocation,
      inventoryGit,
    }),
  });
  const selection = new SelectionWriter({
    fs,
    location: deployedLocation,
    apm,
    operations: new TargetOperationStore({ store }),
  });
  const inventoryOrigin = async () => {
    const root = resolveInventoryPath(await store.read(), process.env);
    const url = root === undefined ? null : await readGitOriginUrl(root);
    return url === null ? null : parseGitOrigin(url);
  };
  const deploy = new DeploySkill({
    inventory,
    registry,
    apm,
    selection,
    inventoryGit,
    copyGuard,
    deployedContent: new DeployedContentAdapter({ location: deployedLocation }),
    // apm's success marker says nothing about what it recorded, so the lockfile
    // is read back before the deploy is called clean (#358).
    recordedPackage: new RecordedPackageAdapter({
      fs,
      location: deployedLocation,
    }),
    // A direct subtree rm for an untargeted tool's leftover copy (#136), never `apm uninstall -g`.
    deployedCleanup: new DeployedCleanupAdapter({ location: deployedLocation }),
    // Probed per deploy, so a global install targets only tools the machine has.
    toolPresence: new ToolPresenceAdapter(),
    inventoryOriginUrl: async () => {
      const root = resolveInventoryPath(await store.read(), process.env);
      return root === undefined ? null : readGitOriginUrl(root);
    },
    canonicalPath: (path) => fs.realpath(path),
    locks: apmWriteLocks,
  });
  const remove = new RemoveDeployedSkill({
    registry,
    deployedRef: new DeployedRefAdapter({ fs, location: deployedLocation }),
    // apm deletes an edited file silently: a removal must prove nothing is lost first.
    copyGuard,
    deployedContent: new DeployedContentAdapter({ location: deployedLocation }),
    apm,
    deployedCleanup: new DeployedCleanupAdapter({ location: deployedLocation }),
    toolPresence: new ToolPresenceAdapter(),
    canonicalPath: (path) => fs.realpath(path),
    locks: apmWriteLocks,
    location: deployedLocation,
    selection,
    inventoryOrigin,
  });
  const retryOperation = new RetryTargetOperation({
    registry,
    selection,
    copyGuard,
    deployedContent: new DeployedContentAdapter({ location: deployedLocation }),
    toolPresence: new ToolPresenceAdapter(),
    canonicalPath: (path) => fs.realpath(path),
    locks: apmWriteLocks,
  });
  const harness = new ReadHarnessState({
    resolveRoot: harnessRoot,
    git: harnessGit,
    freshness: harnessFreshness,
    review: harnessReview,
  });
  const scaffoldOffers = new ScaffoldOffers();
  const copyTreeFs = new NodeCopyTreeFs();
  const connect = new ConnectInventory({
    fs,
    store,
    offers: scaffoldOffers,
    // The configured URL, not a transport rewrite's: apm's refs are built from it.
    originUrl: readConfiguredGitOriginUrl,
    defaultBranch: resolveDefaultBranch,
    isRepositoryRoot,
    probeHead,
    homeRoot: () => homedir(),
    clone: new GitCloneAdapter(),
  });

  return {
    registry,
    inventory,
    harness,
    importSkill: new ImportSkill({
      resolveRoot: harnessRoot,
      fs,
      homeRoot: () => homedir(),
      copy: new CopySkillFolder({ fs: copyTreeFs }),
      facts: copyTreeFs,
      git: harnessGit,
      deployedTargets: async () => [
        {
          treeRoot: deployedLocation.treeRoot({ kind: "global" }),
          lockfilePath: deployedLocation.lockfilePath({ kind: "global" }),
        },
        ...(await registry.list()).map((repo) => ({
          treeRoot: repo.path,
          lockfilePath: deployedLocation.lockfilePath({
            kind: "repo",
            repoPath: repo.path,
          }),
        })),
      ],
    }),
    // Confirmation's own remote read, never the plan's cached one (#520).
    publish: new PublishRelease({
      resolveRoot: harnessRoot,
      git: harnessGit,
      freshness: harnessFreshness,
      // Bound to the root the publication already resolved and locked, so a
      // harness connected mid-flight cannot answer for it (#521).
      replan: (root) => harness.planReleaseAt(root),
      // Own lock, not the apm write lock above: a second confirmation for the
      // same harness must wait, not race the first one's push (#520).
      locks: new InFlightLocks(),
    }),
    promote: new PromoteSkill({
      resolveRoot: harnessRoot,
      git: harnessGit,
      freshness: harnessFreshness,
      locks: harnessPromoteLocks,
      review: harnessReview,
    }),
    // Shares the promotion's lock: an edit and a removal from one fetched tip would race.
    promoteDeletion: new PromoteSkillDeletion({
      resolveRoot: harnessRoot,
      git: harnessGit,
      freshness: harnessFreshness,
      locks: harnessPromoteLocks,
      review: harnessReview,
    }),
    // Shares the promotion lock: it reads the same working tree (#798).
    deleteLocalSkill: new DeleteLocalSkill({
      resolveRoot: harnessRoot,
      fs,
      git: harnessGit,
      locks: harnessPromoteLocks,
    }),
    // Behind the same lock, so a restoration never races a push reading the tree.
    restoreSkill: new RestoreSkill({
      resolveRoot: harnessRoot,
      fs,
      copyFs: copyTreeFs,
      git: harnessGit,
      locks: harnessPromoteLocks,
    }),
    proposals: new ProposalActions({
      resolveRoot: harnessRoot,
      git: harnessGit,
      review: harnessReview,
    }),
    connect,
    scaffold: new ScaffoldHarness({
      fs,
      git: new GitHarnessScaffoldAdapter(),
      // Own lock, keyed on the repository being scaffolded: two scaffolds of
      // one clone would interleave their collision checks (#556).
      locks: new InFlightLocks(),
      offers: scaffoldOffers,
      originUrl: readConfiguredGitOriginUrl,
      connect: (path) => connect.connect(path),
    }),
    // No chooser on Windows yet, like Linux.
    folderChooser: new ChooseFolder({
      chooser: process.platform === "darwin" ? new MacosFolderChooser() : null,
      fs,
      homeRoot: () => homedir(),
    }),
    deployState,
    deploy,
    remove,
    update: new UpdateTarget({
      registry,
      git: harnessGit,
      resolveRoot: harnessRoot,
      harnessOrigin: async () => {
        const root = await harnessRoot();
        return root === undefined ? null : await harnessGit.readOrigin(root);
      },
      toolPresence: new ToolPresenceAdapter(),
      copyGuard,
      selection,
      deployedContent: new DeployedContentAdapter({
        location: deployedLocation,
      }),
      canonicalPath: (path) => fs.realpath(path),
      locks: apmWriteLocks,
    }),
    retryOperation,
    drift,
    resolveGlobalRoot: () => resolveApmGlobalRoot(process.env),
    enforceOriginHost: true,
  };
}

export const app = createApp(realDeps());
