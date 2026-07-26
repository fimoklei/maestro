// Typed contract for the smoke readiness step, so the integration test can
// import it under the repo's strict TypeScript settings.
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
