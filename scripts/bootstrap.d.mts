// Typed contract for the bootstrap checks, so the integration test can import
// it under the repo's strict TypeScript settings
// (LEARNINGS.md · tooling/scripts-are-untypechecked-js).
export interface Gap {
  tool: string;
  /** The exact command (or link) that closes this gap. */
  fix: string;
}

export interface PrerequisiteCheck {
  gaps: Gap[];
  /** Set when apm answered but not at the version Maestro is measured against. */
  apmWarning: string | null;
}

export function checkPrerequisites(input: {
  nodeVersion: string;
  requiredMajor: number;
  platform: string;
  run: (cmd: string, args: string[]) => string;
}): PrerequisiteCheck;

export function formatGaps(gaps: Gap[]): string;
