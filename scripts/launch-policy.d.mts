// Typed contract for the launcher's platform decision, so the integration test
// can import it under the repo's strict TypeScript settings
// (LEARNINGS.md · tooling/scripts-are-untypechecked-js).
export interface LaunchPolicy {
  /** Evict the previous run and refuse foreign port holders before starting. */
  singleInstance: boolean;
  /** Spawn the children as their own process group. */
  detached: boolean;
}

export function launchPolicy(platform: NodeJS.Platform): LaunchPolicy;
