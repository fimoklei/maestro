import { join, resolve } from "node:path";
import {
  resolveApmGlobalRoot,
  resolveApmScratchCwd,
  resolveHomeDirectory,
} from "../home-directory";
import type { DeployTarget } from "./deploy-skill";
import {
  type GlobalLayout,
  REPO_TOOL_ROOTS,
  resolveGlobalLayout,
  type SupportedTool,
  type ToolRoots,
} from "./deploy-tools";

// A global install splits lockfile from tree: the lockfile lives under ~/.apm
// but deployed_file_hashes keys are HOME-relative, or absolute for a folder
// outside HOME.
export class DeployedLocation {
  private readonly env: NodeJS.ProcessEnv;
  private readonly realpath: (path: string) => string;

  constructor(env: NodeJS.ProcessEnv, realpath: (path: string) => string) {
    this.env = env;
    this.realpath = realpath;
  }

  /** What deployed_file_hashes keys are relative to. */
  treeRoot(target: DeployTarget): string {
    return target.kind === "repo"
      ? target.repoPath
      : resolveHomeDirectory(this.env);
  }

  /** Read per access from the environment apm receives. */
  globalLayout(): GlobalLayout {
    return resolveGlobalLayout({
      env: this.env,
      home: resolveHomeDirectory(this.env),
      apmCwd: resolveApmScratchCwd(this.env),
      realpath: this.realpath,
    });
  }

  toolRoots(target: DeployTarget): ToolRoots {
    return target.kind === "repo" ? REPO_TOOL_ROOTS : this.globalLayout().roots;
  }

  /** Each tool's absolute presence marker path. */
  presenceMarkers(): Record<SupportedTool, string> {
    const home = resolveHomeDirectory(this.env);
    const { markers } = this.globalLayout();
    return {
      claude: resolve(home, markers.claude),
      codex: resolve(home, markers.codex),
    } satisfies Record<SupportedTool, string>;
  }

  lockfilePath(target: DeployTarget): string {
    return this.apmRoot(target, "apm.lock.yaml");
  }

  manifestPath(target: DeployTarget): string {
    return this.apmRoot(target, "apm.yml");
  }

  private apmRoot(target: DeployTarget, file: string): string {
    return target.kind === "repo"
      ? join(target.repoPath, file)
      : join(resolveApmGlobalRoot(this.env), file);
  }
}
