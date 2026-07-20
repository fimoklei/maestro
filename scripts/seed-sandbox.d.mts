// Typed contract for the dev harness's seeding step, so the integration test
// can import it under the repo's strict TypeScript settings.
export interface SeedSandboxOptions {
  home: string;
  inventorySource: string;
}

export interface SeededSandbox {
  /** Absolute path to the seeded inventory clone, or null when the source was absent. */
  inventory: string | null;
  candidates: string[];
  warnings: string[];
}

export function seedSandbox(options: SeedSandboxOptions): SeededSandbox;
