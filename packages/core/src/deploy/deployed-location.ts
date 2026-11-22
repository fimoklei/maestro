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

export class DeployedLocation {
  private readonly env: NodeJS.ProcessEnv;
  private readonly realpath: (path: string) => string;

  constructor(env: NodeJS.ProcessEnv, realpath: (path: string) => string) {
    this.env = env;
    this.realpath = realpath;
  }

  treeRoot(target: DeployTarget): string {
    return target.kind === "repo"
      ? target.repoPath
      : resolveHomeDirectory(this.env);
  }

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
