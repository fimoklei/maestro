// The one place every use case is wired. Production passes the Node adapters
// (`nodeUseCasePorts`); a test passes in-memory ones.

import { SelectionWriter } from "./deploy/apply-selection";
import type {
  ApmDriverPort,
  DeployedCleanupPort,
  InventoryGitPort,
} from "./deploy/deploy-skill";
import { DeploySkill } from "./deploy/deploy-skill";
import { DeployedContentAdapter } from "./deploy/deployed-content";
import { DeployedLocation } from "./deploy/deployed-location";
import { DeployedRefAdapter } from "./deploy/deployed-ref";
import { InFlightLocks } from "./deploy/in-flight-locks";
import { LocalCopyGuard } from "./deploy/local-copy-guard";
import { RecordedPackageAdapter } from "./deploy/recorded-package";
import { RemoveDeployedSkill } from "./deploy/remove-deployed-skill";
import { RetryTargetOperation } from "./deploy/retry-target-operation";
import { TargetOperationStore } from "./deploy/target-operation";
import { UpdateTarget } from "./deploy/update-target";
import { GlobalDeployStateReader } from "./deploy-state/deploy-state-reader";
import { ReleaseHeadReader } from "./deploy-state/release-head";
import { CheckVersionDrift } from "./drift/check-version-drift";
import { ReadDrift } from "./drift/read-drift";
import { ReusedOutdated } from "./drift/reused-outdated";
import { CopySkillFolder } from "./filesystem/copy-skill-folder";
import type { CopyTreeFsPort } from "./filesystem/copy-tree-fs";
import { ChooseFolder } from "./folder-chooser/choose-folder";
import type { FolderChooserPort } from "./folder-chooser/folder-chooser-port";
import type { GitHubPage } from "./git/github-page";
import { DeleteLocal } from "./harness/delete-local";
import { DiscardChange } from "./harness/discard-change";
import { HarnessFetchGate } from "./harness/harness-fetch-gate";
import { HarnessFreshnessStore } from "./harness/harness-freshness-store";
import type { HarnessGitAdapter } from "./harness/harness-git";
import type { HarnessReviewPort } from "./harness/harness-review-port";
import { ImportLocalEdits } from "./harness/import-local-edits";
import { ImportPrompt } from "./harness/import-prompt";
import { ImportSkill } from "./harness/import-skill";
import { Promote } from "./harness/promote";
import { PromoteDeletion } from "./harness/promote-deletion";
import { ProposalActions } from "./harness/proposal-actions";
import { PublishRelease } from "./harness/publish-release";
import {
  type HarnessGitPort,
  ReadHarnessState,
} from "./harness/read-harness-state";
import { rememberOrigin } from "./harness/remembered-origin";
import { Restore } from "./harness/restore";
import { ReviewReadGate } from "./harness/review-read-gate";
import {
  resolveApmGlobalRoot,
  resolveMaestroConfigPath,
} from "./home-directory";
import type { CloneRepositoryPort } from "./inventory/clone-repository";
import { ConnectInventory } from "./inventory/connect-inventory";
import type { HarnessScaffoldGitPort } from "./inventory/harness-scaffold-git";
import type { HeadProbe } from "./inventory/head-commit";
import { InventoryReader } from "./inventory/inventory-reader";
import { pendingReleaseFromGit } from "./inventory/pending-release";
import { releasedPrimitivesFromGit } from "./inventory/released-primitives";
import { resolveInventoryPath } from "./inventory/resolve-inventory-path";
import { ScaffoldHarness } from "./inventory/scaffold-harness";
import { ScaffoldOffers } from "./inventory/scaffold-offers";
import { ConfigStore } from "./registry/config-store";
import type { FileSystemPort } from "./registry/file-system";
import { Registry } from "./registry/registry";
import type { ToolPresencePort } from "./tools/tool-presence-port";

// The outside world only: filesystem, apm, git, gh, home and environment.
export type UseCasePorts = {
  // Read per access, so a MAESTRO_HOME or HOME set after startup is honoured.
  env: NodeJS.ProcessEnv;
  home: () => string;
  fs: FileSystemPort;
  copyTree: CopyTreeFsPort;
  toolPresence: ToolPresencePort;
  deployedCleanup: DeployedCleanupPort;
  apm: ApmDriverPort;
  git: {
    harness: HarnessGitPort &
      Pick<
        HarnessGitAdapter,
        | "readOrigin"
        | "readTags"
        | "readSkillTreesAtTag"
        | "readPrimitivesAtTag"
        | "readSkillManifestsAtTag"
        | "readPromptTextsAtTag"
      >;
    // Bound to the Harness root the composition resolves per call.
    inventory: (
      resolveRoot: () => Promise<string | undefined>,
    ) => InventoryGitPort;
    clone: CloneRepositoryPort;
    scaffold: HarnessScaffoldGitPort;
    // The URL as configured, before any transport rewrite.
    originUrl: (path: string) => Promise<string | null>;
    defaultBranch: (path: string) => Promise<string | null>;
    isRepositoryRoot: (path: string) => Promise<boolean>;
    probeHead: (path: string) => Promise<HeadProbe>;
    githubPage: (path: string) => Promise<GitHubPage | null>;
  };
  gh: HarnessReviewPort;
  // Null on a platform with no chooser helper.
  folderChooser: FolderChooserPort | null;
};

export type UseCases = ReturnType<typeof composeUseCases>;

// How old an `apm outdated` answer for one Target a Drift read may reuse.
const OUTDATED_MAX_AGE_MS = 30_000;
// How old a review read the Harness read may reuse.
const REVIEW_READ_MAX_AGE_MS = 30_000;

export function composeUseCases(ports: UseCasePorts) {
  const { env, fs, git } = ports;
  const harnessGit = git.harness;
  const { copyTree: copyTreeFs, toolPresence, deployedCleanup } = ports;
  // Resolved per access, not at construction: the config path follows the env.
  const store = new ConfigStore({
    fs,
    configPath: () => resolveMaestroConfigPath(env),
  });
  const registry = new Registry({
    fs,
    store,
    resolveCentralInventoryPath: (config) => resolveInventoryPath(config, env),
  });
  const inventoryPath = async () =>
    resolveInventoryPath(await store.read(), env);
  // Resolved per read, so a path saved after startup is picked up without a restart.
  const inventory = new InventoryReader({
    fs,
    resolvePath: inventoryPath,
    originUrl: git.originUrl,
    readReleased: releasedPrimitivesFromGit(harnessGit),
    readPendingRelease: pendingReleaseFromGit(harnessGit),
  });
  const harnessRoot = async () => {
    const path = await inventoryPath();
    if (path === undefined) {
      return undefined;
    }
    // A path git cannot be pointed at is a harness that is not connected —
    // never the raw path, which would run git against something unresolved.
    return await fs.realpath(path).catch(() => undefined);
  };
  const inventoryGit = git.inventory(harnessRoot);
  // Shared instance, so guard and cleanup agree on a global deploy's lockfile root and tree.
  const deployedLocation = new DeployedLocation(env);
  const canonicalPath = (path: string) => fs.realpath(path);
  // Every use case drives apm through this one, so each write drops its answer.
  const apm = new ReusedOutdated({
    apm: ports.apm,
    canonicalPath,
    now: () => new Date(),
    maxAgeMs: OUTDATED_MAX_AGE_MS,
  });
  // A new release or proposal changes what Behind means for every Target.
  const droppingOutdated = <Args extends unknown[], Result>(useCase: {
    execute: (...args: Args) => Promise<Result>;
  }) => ({
    execute: (...args: Args) =>
      useCase.execute(...args).finally(() => apm.dropAll()),
  });
  // Measured against the latest release too, as Update target measures (#1213).
  const releaseAwareContent = new DeployedContentAdapter({
    location: deployedLocation,
    inventoryGit,
    fs: copyTreeFs,
  });
  const deployedContent = new DeployedContentAdapter({
    location: deployedLocation,
    fs: copyTreeFs,
  });
  // The configured origin names the Harness; an `insteadOf` only moves where
  // git connects.
  const readHarnessOrigin = rememberOrigin({
    fs,
    readOrigin: (root) => harnessGit.readOrigin(root),
  });
  const harnessOrigin = async () => {
    const root = await harnessRoot();
    return root === undefined ? null : await readHarnessOrigin(root);
  };
  const deployState = new GlobalDeployStateReader({
    fs,
    toolPresence,
    treeRoot: () => deployedLocation.treeRoot({ kind: "global" }),
    releaseHead: new ReleaseHeadReader({
      git: harnessGit,
      resolveRoot: harnessRoot,
      now: () => new Date(),
    }),
    harnessOrigin,
    content: releaseAwareContent,
    // Read per request, not captured at construction: the retry use-case is
    // built further down, and the record it reads changes with every write.
    operations: { pending: (target) => retryOperation.pending(target) },
    githubPage: git.githubPage,
    // What a target's release and skills link to (#1181).
    harnessPage: async () => {
      const root = await harnessRoot();
      return root === undefined ? null : await git.githubPage(root);
    },
  });
  const harnessFreshness = new HarnessFreshnessStore({ store });
  // One gate for every read of the clone, keyed on the resolved root.
  const harnessFetchGate = new HarnessFetchGate({
    git: harnessGit,
    freshness: harnessFreshness,
    now: () => new Date(),
  });
  // Every review write goes through `writes`, so a Proposal action shows at once.
  const reviewGate = new ReviewReadGate({
    review: ports.gh,
    root: harnessRoot,
    now: () => new Date(),
  });
  // A deploy always fetches, so it never deploys from a stale clone (#666).
  const syncHarness = async () => {
    const root = await harnessRoot();
    if (root !== undefined) {
      await harnessFetchGate.fetchFresh(root).catch(() => {});
    }
  };
  // Shared by both ways a movement reaches review: two of them for the same
  // harness must queue, not race each other's temporary index and push.
  const harnessPromoteLocks = new InFlightLocks();

  const drift = new ReadDrift({
    drift: new CheckVersionDrift({
      registry,
      apm,
      canonicalPath,
    }),
    fs,
    location: deployedLocation,
    resolveRoot: harnessRoot,
    git: {
      readOrigin: readHarnessOrigin,
      readSkillTreesAtTag: (root, tag) =>
        harnessGit.readSkillTreesAtTag(root, tag),
    },
    fetchHarness: (root) => harnessFetchGate.fetchRecent(root),
  });
  // Shared by deploy and remove: both rewrite the same apm.lock.yaml, and a
  // deploy racing a remove would corrupt it.
  const apmWriteLocks = new InFlightLocks();
  const copyGuard = new LocalCopyGuard({ content: releaseAwareContent });
  const selection = new SelectionWriter({
    fs,
    location: deployedLocation,
    apm,
    operations: new TargetOperationStore({ store }),
  });
  const deploy = new DeploySkill({
    inventory,
    registry,
    apm,
    selection,
    inventoryGit,
    syncHarness,
    copyGuard,
    deployedContent,
    // apm's success marker says nothing about what it recorded, so the lockfile
    // is read back before the deploy is called clean (#358).
    recordedPackage: new RecordedPackageAdapter(),
    // A direct subtree rm for an untargeted tool's leftover copy (#136), never `apm uninstall -g`.
    deployedCleanup,
    // Probed per deploy, so a global install targets only tools the machine has.
    toolPresence,
    harnessOrigin,
    canonicalPath,
    locks: apmWriteLocks,
  });
  const remove = new RemoveDeployedSkill({
    registry,
    deployedRef: new DeployedRefAdapter({ fs, location: deployedLocation }),
    // apm deletes an edited file silently: a removal must prove nothing is lost first.
    copyGuard,
    deployedContent,
    apm,
    deployedCleanup,
    toolPresence,
    canonicalPath,
    locks: apmWriteLocks,
    location: deployedLocation,
    selection,
    harnessOrigin,
  });
  const retryOperation = new RetryTargetOperation({
    registry,
    selection,
    deployedCleanup,
    copyGuard,
    deployedContent,
    toolPresence,
    canonicalPath,
    locks: apmWriteLocks,
  });
  const harness = new ReadHarnessState({
    resolveRoot: harnessRoot,
    git: harnessGit,
    freshness: harnessFreshness,
    // Opening the Harness screen and Re-read Harness always fetch (#1630).
    fetchHarness: (root) => harnessFetchGate.fetchFresh(root),
    review: reviewGate.reads(REVIEW_READ_MAX_AGE_MS),
  });
  const scaffoldOffers = new ScaffoldOffers();
  const connect = new ConnectInventory({
    fs,
    store,
    offers: scaffoldOffers,
    // The configured URL, not a transport rewrite's: apm's refs are built from it.
    originUrl: git.originUrl,
    defaultBranch: git.defaultBranch,
    isRepositoryRoot: git.isRepositoryRoot,
    probeHead: git.probeHead,
    homeRoot: ports.home,
    clone: git.clone,
  });

  const importSkill = new ImportSkill({
    resolveRoot: harnessRoot,
    fs,
    homeRoot: ports.home,
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
  });

  return {
    registry,
    inventory,
    harness,
    importSkill,
    // Shares the lock Delete takes: an import never writes while another Harness change runs.
    importPrompt: new ImportPrompt({
      resolveRoot: harnessRoot,
      fs,
      locks: harnessPromoteLocks,
    }),
    // Measured by Deploy-state's own reader; shares the lock Delete and Restore take.
    importLocalEdits: new ImportLocalEdits({
      registry,
      deployState,
      content: releaseAwareContent,
      tree: {
        listRawEntries: (path) => fs.listRawEntries(path),
        readFile: (path) => fs.readFile(path),
        describe: (path) => copyTreeFs.describe(path),
      },
      globalRoot: () => resolveApmGlobalRoot(env),
      home: () => deployedLocation.treeRoot({ kind: "global" }),
      importSkill,
      git: harnessGit,
      resolveRoot: harnessRoot,
      locks: harnessPromoteLocks,
    }),
    // Confirmation's own remote read, never the plan's cached one (#520).
    publish: droppingOutdated(
      new PublishRelease({
        resolveRoot: harnessRoot,
        git: harnessGit,
        fetchGate: harnessFetchGate,
        // Bound to the root the publication already resolved and locked, so a
        // harness connected mid-flight cannot answer for it (#521).
        replan: (root) => harness.planReleaseAt(root),
        // Own lock, not the apm write lock above: a second confirmation for the
        // same harness must wait, not race the first one's push (#520).
        locks: new InFlightLocks(),
      }),
    ),
    promote: droppingOutdated(
      new Promote({
        resolveRoot: harnessRoot,
        git: harnessGit,
        fetchGate: harnessFetchGate,
        locks: harnessPromoteLocks,
        review: reviewGate.writes,
      }),
    ),
    // Shares the promotion's lock: an edit and a removal from one fetched tip would race.
    promoteDeletion: droppingOutdated(
      new PromoteDeletion({
        resolveRoot: harnessRoot,
        git: harnessGit,
        fetchGate: harnessFetchGate,
        locks: harnessPromoteLocks,
        review: reviewGate.writes,
      }),
    ),
    // Shares the promotion lock: it reads the same working tree (#798).
    deleteLocal: new DeleteLocal({
      resolveRoot: harnessRoot,
      fs,
      git: harnessGit,
      locks: harnessPromoteLocks,
    }),
    // Behind the same lock, so a restoration never races a push reading the tree.
    restore: new Restore({
      resolveRoot: harnessRoot,
      fs,
      copyFs: copyTreeFs,
      git: harnessGit,
      locks: harnessPromoteLocks,
    }),
    // Rechecks the stage the row was read in, behind the same lock.
    discard: new DiscardChange({
      resolveRoot: harnessRoot,
      readStages: async () => {
        const read = await harness.execute();
        return read.ok ? read.state.stages : null;
      },
      fs,
      copyFs: copyTreeFs,
      git: harnessGit,
      locks: harnessPromoteLocks,
    }),
    proposals: new ProposalActions({
      resolveRoot: harnessRoot,
      git: harnessGit,
      review: reviewGate.writes,
    }),
    connect,
    scaffold: new ScaffoldHarness({
      fs,
      git: git.scaffold,
      // Own lock, keyed on the repository being scaffolded: two scaffolds of
      // one clone would interleave their collision checks (#556).
      locks: new InFlightLocks(),
      offers: scaffoldOffers,
      originUrl: git.originUrl,
      connect: (path) => connect.connect(path),
    }),
    folderChooser: new ChooseFolder({
      chooser: ports.folderChooser,
      fs,
      homeRoot: ports.home,
    }),
    deployState,
    deploy,
    remove,
    update: new UpdateTarget({
      registry,
      git: harnessGit,
      resolveRoot: harnessRoot,
      harnessOrigin,
      toolPresence,
      copyGuard,
      selection,
      deployedCleanup,
      deployedContent,
      canonicalPath,
      locks: apmWriteLocks,
    }),
    retryOperation,
    drift,
    // Tests inject a sandbox so the real ~/.apm is never touched.
    resolveGlobalRoot: () => resolveApmGlobalRoot(env),
  };
}
