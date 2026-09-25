export interface LaunchPolicy {
  /** Evict the previous run and refuse foreign port holders before starting. */
  singleInstance: boolean;
  /** Spawn the children as their own process group. */
  detached: boolean;
}

export function launchPolicy(platform: NodeJS.Platform): LaunchPolicy;
