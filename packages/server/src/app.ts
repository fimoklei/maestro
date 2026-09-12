import { homedir } from "node:os";
import {
  ApmCliDriver,
  BrowseFilesystem,
  CheckVersionDrift,
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
  NodeCopyTreeFs,
  NodeFileSystem,
  PromoteSkill,
  PromoteSkillDeletion,
  ProposalActions,
  PublishRelease,
  probeHead,
  ReadDrift,
  ReadHarnessState,
  RecordedPackageAdapter,
  Registry,
  ReleaseHeadReader,
  RemoveDeployedSkill,
  RestoreSkill,
  readConfiguredGitOriginUrl,
  readGitOriginUrl,
  releasedSkillsFromGit,
  resolveApmGlobalRoot,
  resolveApmScratchCwd,
  resolveDefaultBranch,
  resolveInventoryPath,
  resolveMaestroConfigPath,
  ScaffoldHarness,
  ScaffoldOffers,
  ToolPresenceAdapter,
} from "@maestro/core";
import { Hono } from "hono";
import type { AppDeps } from "./app-deps";
import { originHostGuard } from "./origin-host-guard";
import { registerDeployRoutes } from "./routes/deploy-routes";
import { registerFolderRoutes } from "./routes/folder-routes";
import { registerHarnessAuthoringRoutes } from "./routes/harness-authoring-routes";
import { registerHarnessRoutes } from "./routes/harness-routes";
import { registerInventoryRoutes } from "./routes/inventory-routes";

// Composition root for the HTTP surface: the guard, then one register call per
// route group. Every group takes the deps it needs from the one object
// production and the tests both build.
export function createApp(deps: AppDeps) {
  const app = new Hono();

  // Reachability only: that the route answers at all is the signal.
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
  // Shared by the harness read, the release confirm and the Inventory read
  // below, so all three name the same connected clone.
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
  // Shared instance: a global deploy's lockfile root and deploy tree differ
  // (~/.apm vs ~/.claude/skills, apm-driver.md #56/#61) — guard and cleanup agree by construction.
  const deployedLocation = new DeployedLocation(process.env);
  const deployState = new GlobalDeployStateReader({
    fs,
    toolPresence: new ToolPresenceAdapter(),
    treeRoot: () => deployedLocation.treeRoot({ kind: "global" }),
    // Which release each target follows, compared against the connected
    // Harness's own tags and trees (ADR-0031).
    releaseHead: new ReleaseHeadReader({
      git: harnessGit,
      resolveRoot: harnessRoot,
      now: () => new Date(),
    }),
    // The Local edits / Unverified chip a deployed row carries, from the same
    // classifier the write path's guard uses.
    content: new DeployedContentAdapter({ location: deployedLocation }),
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
  // GitHub's side of the journey, through the author's own gh sign-in. Optional
  // by design: absent or unauthenticated, the review stage degrades and every
  // git fact stays readable (ADR-0029).
  const harnessReview = new GhCliAdapter();
  const harnessFreshness = new HarnessFreshnessStore({ store });
  // Shared by both ways a movement reaches review: two of them for the same
  // harness must queue, not race each other's temporary index and push.
  const harnessPromoteLocks = new InFlightLocks();

  // apm owns Behind; the content reading beside it is a git-tree read of the
  // connected Harness, joined before the row renders (ADR-0027).
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
  const deploy = new DeploySkill({
    inventory,
    registry,
    apm,
    inventoryGit: new InventoryGitAdapter({
      resolveRoot: async () =>
        resolveInventoryPath(await store.read(), process.env),
    }),
    deployedContent: new DeployedContentAdapter({ location: deployedLocation }),
    // apm's success marker says nothing about what it recorded, so the lockfile
    // is read back before the deploy is called clean (#358).
    recordedPackage: new RecordedPackageAdapter({
      fs,
      location: deployedLocation,
    }),
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
  // Same connected clone the inventory reads, canonicalized per call so a
  // path saved after startup is picked up and a symlinked one is resolved.
  // Shared by the read and the publish below, so both name the same harness.
  const harness = new ReadHarnessState({
    resolveRoot: harnessRoot,
    git: harnessGit,
    freshness: harnessFreshness,
    review: harnessReview,
  });
  // One register for both use cases: connect writes the offers the scaffold
  // will only act on (#556).
  const scaffoldOffers = new ScaffoldOffers();
  const copyTreeFs = new NodeCopyTreeFs();
  const connect = new ConnectInventory({
    fs,
    store,
    offers: scaffoldOffers,
    // The URL the author configured, not the one a transport rewrite sends git
    // to: connect gates on the repository's identity, which is what apm's refs
    // are built from (LEARNINGS · git-remote-get-url).
    originUrl: readConfiguredGitOriginUrl,
    defaultBranch: resolveDefaultBranch,
    isRepositoryRoot,
    probeHead,
    // The default ceiling, which the picker can move (#555). Browsing uses the
    // same one, so a cloned Harness lands where it can reach it (#554).
    homeRoot: () => homedir(),
    clone: new GitCloneAdapter(),
  });

  return {
    registry,
    inventory,
    harness,
    // The same connected clone every harness read names. Deployed roots are
    // read per call, so a repo registered after startup counts (#576).
    importSkill: new ImportSkill({
      resolveRoot: harnessRoot,
      fs,
      // The picker's ceiling, so what can be imported is what can be browsed.
      homeRoot: () => homedir(),
      copy: new CopySkillFolder({ fs: copyTreeFs }),
      // The same reader the copy walks with, for the one mode bit git tracks.
      facts: copyTreeFs,
      // The same harness git the read and the promotions use: an update is
      // proved against the clone's own origin, and refused while its copy of
      // the skill holds uncommitted work (#732).
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
    // Confirmation's own remote read, never the plan's cached one — the same
    // harness, git port, and freshness record as the read above (#520).
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
    // The same connected clone, git port, and freshness record the read and
    // the release use, so all three speak about one harness (#577).
    promote: new PromoteSkill({
      resolveRoot: harnessRoot,
      git: harnessGit,
      freshness: harnessFreshness,
      locks: harnessPromoteLocks,
      review: harnessReview,
    }),
    // Publishing a removal is the same branch lifecycle one movement the other
    // way, so it shares the promotion's lock: an edit and a removal building
    // commits from one fetched tip would each answer for the other's refs.
    promoteDeletion: new PromoteSkillDeletion({
      resolveRoot: harnessRoot,
      git: harnessGit,
      freshness: harnessFreshness,
      locks: harnessPromoteLocks,
      review: harnessReview,
    }),
    // Removing a skill that exists nowhere else: no fetch, no push, no review
    // call. It shares the promotion lock all the same — a removal beside one
    // would answer for a working tree the other is reading (#798).
    deleteLocalSkill: new DeleteLocalSkill({
      resolveRoot: harnessRoot,
      fs,
      git: harnessGit,
      locks: harnessPromoteLocks,
    }),
    // Putting one back, from the same clone and behind the same lock: a
    // restoration writing a folder beside a push reading the working tree
    // would each answer for what the other saw (ADR-0030).
    restoreSkill: new RestoreSkill({
      resolveRoot: harnessRoot,
      fs,
      copyFs: copyTreeFs,
      git: harnessGit,
      locks: harnessPromoteLocks,
    }),
    // The same gh boundary the read uses, so what a mutation rechecks and what
    // the rows were painted from cannot come from two places (#827).
    proposals: new ProposalActions({
      resolveRoot: harnessRoot,
      git: harnessGit,
      review: harnessReview,
    }),
    // Checked offline against local git config, so the error lands before
    // the first deploy (#147).
    connect,
    // Connects through the same use case, so a scaffolded Harness passes
    // exactly the checks a joined one does (#556).
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
