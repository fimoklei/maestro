import { homedir } from "node:os";
import type { UseCasePorts } from "./compose-use-cases";
import { ApmCliDriver } from "./deploy/apm-cli-driver";
import { DeployedCleanupAdapter } from "./deploy/deployed-cleanup";
import { DeployedLocation } from "./deploy/deployed-location";
import { formerClaudeProfiles } from "./deploy/former-claude-folders";
import { InventoryGitAdapter } from "./deploy/inventory-git";
import { NodeCopyTreeFs } from "./filesystem/copy-tree-fs";
import { lenientRealpath } from "./filesystem/lenient-realpath";
import { platformFolderChooser } from "./folder-chooser/platform-folder-chooser";
import { readConfiguredGitOriginUrl } from "./git/configured-origin";
import { readGitHubPage } from "./git/github-page";
import { GhCliAdapter } from "./harness/gh-cli-adapter";
import { HarnessGitAdapter } from "./harness/harness-git";
import { ReleasedContentReader } from "./harness/released-content";
import { resolveApmScratchCwd, resolveHomeDirectory } from "./home-directory";
import { GitCloneAdapter } from "./inventory/clone-repository";
import { resolveDefaultBranch } from "./inventory/default-branch";
import { GitHarnessScaffoldAdapter } from "./inventory/harness-scaffold-git";
import { probeHead } from "./inventory/head-commit";
import { isRepositoryRoot } from "./inventory/repository-root";
import { parseLockfile } from "./lockfile/lockfile";
import { NodeFileSystem } from "./registry/node-file-system";
import { ToolPresenceAdapter } from "./tools/tool-presence";

export function nodeUseCasePorts(env: NodeJS.ProcessEnv): UseCasePorts {
  const fs = new NodeFileSystem();
  const released = new ReleasedContentReader();
  const location = new DeployedLocation(env, lenientRealpath);
  return {
    env,
    home: () => homedir(),
    lenientRealpath,
    fs,
    copyTree: new NodeCopyTreeFs(),
    toolPresence: new ToolPresenceAdapter({ location }),
    deployedCleanup: new DeployedCleanupAdapter({ location }),
    // A scratch dir under MAESTRO_HOME, so apm's .gitignore edit never lands in
    // a real repo.
    apm: new ApmCliDriver({
      prepareGlobalCwd: async () => {
        const cwd = resolveApmScratchCwd(env);
        await fs.ensureDir(cwd);
        return cwd;
      },
      formerClaudeProfiles: async () => {
        const raw = await fs.readFile(
          location.lockfilePath({ kind: "global" }),
        );
        const lockfile = raw === null ? null : parseLockfile(raw);
        return lockfile?.ok === true
          ? formerClaudeProfiles({
              deployments: lockfile.deployments,
              layout: location.globalLayout(),
              home: lenientRealpath(resolveHomeDirectory(env)),
              realpath: lenientRealpath,
            })
          : [];
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
    gh: new GhCliAdapter(),
    folderChooser: platformFolderChooser(process.platform),
  };
}
