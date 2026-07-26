// Typed contract for the port-ownership guard, so the integration test can
// import it under the repo's strict TypeScript settings.
export interface PortOwner {
  port: number;
  pid: number;
  /** Null when the holder's working directory cannot be read. */
  cwd: string | null;
  /** The git worktree the holder runs in; null when it is not in one — never "ours". */
  worktreeRoot: string | null;
}

export interface OwnershipDecision {
  blocked: boolean;
  message?: string;
}

export function decidePortOwnership(input: {
  command: string;
  worktreeRoot: string | null;
  owners: PortOwner[];
}): OwnershipDecision;

export function findPortOwners(ports?: number[]): PortOwner[];
