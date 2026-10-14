// The production outside world for `composeUseCases`.
import { homedir } from "node:os";
import type { UseCasePorts } from "./compose-use-cases";
import { ApmCliDriver } from "./deploy/apm-cli-driver";
import { DeployedCleanupAdapter } from "./deploy/deployed-cleanup";
import { DeployedLocation } from "./deploy/deployed-location";
import { InventoryGitAdapter } from "./deploy/inventory-git";
import { NodeCopyTreeFs } from "./filesystem/copy-tree-fs";
import { platformFolderChooser } from "./folder-chooser/platform-folder-chooser";
import { readConfiguredGitOriginUrl } from "./git/configured-origin";
import { readGitHubPage } from "./git/github-page";
import { GhCliAdapter } from "./harness/gh-cli-adapter";
import { HarnessGitAdapter } from "./harness/harness-git";
import { ReleasedContentReader } from "./harness/released-content";
import { resolveApmScratchCwd } from "./home-directory";
import { GitCloneAdapter } from "./inventory/clone-repository";
import { resolveDefaultBranch } from "./inventory/default-branch";
import { GitHarnessScaffoldAdapter } from "./inventory/harness-scaffold-git";
import { probeHead } from "./inventory/head-commit";
import { isRepositoryRoot } from "./inventory/repository-root";
import { NodeFileSystem } from "./registry/node-file-system";
import { ToolPresenceAdapter } from "./tools/tool-presence";

export function nodeUseCasePorts(env: NodeJS.ProcessEnv): UseCasePorts {
  const fs = new NodeFileSystem();
  const released = new ReleasedContentReader();
  return {
    env,
    home: () => homedir(),
    fs,
    copyTree: new NodeCopyTreeFs(),
    toolPresence: new ToolPresenceAdapter(),
    deployedCleanup: new DeployedCleanupAdapter({
      location: new DeployedLocation(env),
    }),
    // A scratch dir under MAESTRO_HOME, so apm's .gitignore edit never lands in
    // a real repo. The driver passes apm only the ambient env.
    apm: new ApmCliDriver({
      prepareGlobalCwd: async () => {
        const cwd = resolveApmScratchCwd(env);
        await fs.ensureDir(cwd);
        return cwd;
      },
    }),
    git: {
      harness: new HarnessGitAdapter({ released }),
      inventory: (resolveRoot) =>
        new InventoryGitAdapter({ resolveRoot, released }),
      clone: new GitCloneAdapter(),
      scaffold: new GitHarnessScaffoldAdapter(),
      originUrl: readConfiguredGitOriginUrl,
      defaultBranch: resolveDefaultBranch,
      isRepositoryRoot,
      probeHead,
      githubPage: readGitHubPage,
    },
    // Optional: without gh or its sign-in, only the review stage degrades. The
    // adapter passes gh only the ambient env.
    gh: new GhCliAdapter(),
    folderChooser: platformFolderChooser(process.platform),
  };
}
