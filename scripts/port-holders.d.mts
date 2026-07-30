// Typed contract for the port-holder lookup, so the integration test can
// import it under the repo's strict TypeScript settings
// (LEARNINGS.md · tooling/scripts-are-untypechecked-js).
export interface PortHolder {
  port: number;
  pid: number;
  /** Null when the holder hides it — another user's process, typically. */
  command: string | null;
  /** Null when the holder's working directory cannot be read. */
  cwd: string | null;
}

export function pidsOnPort(
  port: number,
  lsof?: (args: string[]) => string,
): number[];

export function findPortHolders(
  ports: number[],
  lsof?: (args: string[]) => string,
): PortHolder[];

/** Null when every port is free. */
export function describeHeldPorts(holders: PortHolder[]): string | null;
