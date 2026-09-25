export interface WaitResult {
  ready: boolean;
  waitedMs: number;
}

export function waitForCockpit(input: {
  probe: () => Promise<boolean>;
  timeoutMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<WaitResult>;

export interface SmokeMarker {
  launcherPid: number;
}

/** Null when the sandbox holds no marker worth trusting. */
export function readSmokeMarker(sandboxDir: string): SmokeMarker | null;

export interface IdentityDecision {
  ok: boolean;
  reason?: string;
}

export interface PortHolders {
  port: number;
  pids: number[];
}

export function identifySmokeInstance(input: {
  marker: SmokeMarker | null;
  holders: PortHolders[];
  processGroupOf: (pid: number) => number | null;
}): IdentityDecision;

export interface SeedReport {
  primitiveCount: number;
  repoCount: number;
}

export function seedCockpit(input: {
  request: (
    path: string,
    body: unknown,
  ) => Promise<{ status: number; body: unknown }>;
  inventoryPath: string;
  repoPath: string;
}): Promise<SeedReport>;
