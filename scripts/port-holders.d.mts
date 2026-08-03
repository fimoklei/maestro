// Typed contract for the port-holder lookup, so the integration test can
// import it under the repo's strict TypeScript settings
// (LEARNINGS.md · tooling/scripts-are-untypechecked-js).
export interface PortHolder {
  port: number;
  /** Null when the lookup failed — never read as "the port is free". */
  pid: number | null;
  /** Null when the holder hides it — another user's process, typically. */
  command: string | null;
  /** Null when the holder's working directory cannot be read. */
  cwd: string | null;
}

/** Null when the lookup could not answer; empty when the port is free. */
export function pidsOnPort(
  port: number,
  lsof?: (args: string[]) => string,
): number[] | null;

export function findPortHolders(
  ports: number[],
  lsof?: (args: string[]) => string,
): PortHolder[];

/** Null when every port is free. */
export function describeHeldPorts(holders: PortHolder[]): string | null;

export interface ForeignPortHolder extends PortHolder {
  /** The worktree whose directory the holder runs in. */
  worktree: string;
}

/** Empty when git could not be asked — never read as "no worktrees exist". */
export function listWorktrees(
  repoRoot: string,
  git?: (args: string[]) => string,
  resolve?: (path: string) => string,
): string[];

export function partitionHolders(
  holders: PortHolder[],
  attribution: { self: string; worktrees: string[] },
): { foreign: ForeignPortHolder[]; evictable: PortHolder[] };

/** Null when no other worktree holds a port. */
export function describeForeignHolders(
  foreign: ForeignPortHolder[],
): string | null;
