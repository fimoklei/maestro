// Typed contract for the cockpit's port resolver, so the integration test can
// import it under the repo's strict TypeScript settings
// (LEARNINGS.md · tooling/scripts-are-untypechecked-js).
export interface CockpitPorts {
  server: number;
  web: number;
}

export function cockpitPortsFor(
  worktreePath: string,
  env?: Record<string, string | undefined>,
  /** Every worktree of the repo; null when git could not be asked. */
  worktrees?: string[] | null,
): CockpitPorts;

export function cockpitPorts(
  env?: Record<string, string | undefined>,
): CockpitPorts;

export function cockpitUrls(ports?: CockpitPorts): { web: string; api: string };
