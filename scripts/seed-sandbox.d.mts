// Typed contract for the dev harness's seeding step, so the integration test
// can import it under the repo's strict TypeScript settings.
export interface SeedSandboxOptions {
  home: string;
  inventorySource: string;
  /** Bridged gh token; absent leaves the sandbox without git credentials. */
  githubToken?: string;
}

export interface SeededSandbox {
  /** Absolute path to the seeded inventory clone, or null when the source was absent. */
  inventory: string | null;
  candidates: string[];
  warnings: string[];
}

export function seedSandbox(options: SeedSandboxOptions): SeededSandbox;

export interface SeededPaths {
  inventory: string;
  firstRepo: string;
}

export function seededPaths(home: string): SeededPaths;

export const MARKER_FILE: string;

export function writeSmokeMarker(
  sandboxDir: string,
  marker: { launcherPid: number },
): void;
