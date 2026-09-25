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
  /** The worktree the holder runs in; null when ownership is unknown. */
  worktree: string | null;
}

/** Which worktree owns what. A null list means ownership cannot be decided. */
export interface Attribution {
  self: string;
  worktrees: string[] | null;
}

/** Null when git could not be asked — never an empty list. */
export function listWorktrees(
  repoRoot: string,
  git?: (args: string[]) => string,
  resolve?: (path: string) => string,
): string[] | null;

export function partitionHolders(
  holders: PortHolder[],
  attribution: Attribution,
): { foreign: ForeignPortHolder[]; evictable: PortHolder[] };

/** Null when the process cannot be placed in a worktree. */
export function processWorktree(
  pid: number,
  attribution: Pick<Attribution, "worktrees">,
  lsof?: (args: string[]) => string,
): string | null;

/** Null when every holder is this run's to take. */
export function describeForeignHolders(
  foreign: ForeignPortHolder[],
): string | null;
