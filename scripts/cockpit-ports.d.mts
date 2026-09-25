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
