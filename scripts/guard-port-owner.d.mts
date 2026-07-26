// Typed contract for the port-ownership guard, so the integration test can
// import it under the repo's strict TypeScript settings.
export interface PortOwner {
  port: number;
  /** Null when the port lookup could not answer — never read as "the port is free". */
  pid: number | null;
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

export function findPortOwners(
  ports?: number[],
  lsof?: (args: string[]) => string,
): PortOwner[];

export interface SandboxState {
  /** False when no smoke sandbox exists — the cockpit is not in rehearsal mode. */
  exists: boolean;
  inventoryPath: string | null;
  repos: { path: string }[];
}

export function readSandboxState(sandboxDir: string): SandboxState;

export function decideCockpitReadiness(input: {
  command: string;
  sandbox: SandboxState;
}): OwnershipDecision;
