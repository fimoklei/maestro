export const SCENARIO_NAMES: string[];

export function parseScenarioArg(argv: readonly string[]): string[] | null;

export interface CockpitRead {
  deployState: {
    primitives: {
      type: "skill";
      name: string;
      version: string;
      copy?: "local-edits" | "unverified";
    }[];
    skipped: { reason: string }[];
    releaseHead?: { release: string; latestRelease: string | null };
    pinnedPerSkill?: { release: string; skills: number }[];
    pendingOperation?: {
      kind: "deploy" | "remove" | "update";
      release: string;
      desired: string[];
    };
  } | null;
  drift:
    | { behind: { name: string; reading: string; latest?: string }[] }
    | { ok: false; reason?: string };
  preview?: {
    changed: { name: string }[];
    removed: string[];
    newInRelease: { name: string }[];
  };
  localEdits?: {
    name: string;
    refusal: string | null;
    undoesNewerSince?: string;
  }[];
}

export interface CockpitReading {
  status: string | null;
  release: string | null;
  notice: string | null;
  skills: Record<string, string>;
  preview?: { changed: string[]; removed: string[]; newInRelease: string[] };
  imports?: Record<string, string>;
}

export function readCockpit(read: CockpitRead): CockpitReading;

export interface ScenarioExpectation {
  status?: string;
  release?: string;
  notice?: string;
  skills?: Record<string, string>;
  preview?: { changed?: string[]; removed?: string[]; newInRelease?: string[] };
  imports?: Record<string, string>;
}

export function scenarioMismatch(
  scenario: { name: string; expect: ScenarioExpectation },
  repoPath: string,
  observed: CockpitReading,
): string | null;

export interface HarnessRead {
  releaseState: string;
  stages: Record<
    "proposal" | "release",
    | {
        outcome: "read";
        rows: { skill: string; change: string; restorable: boolean }[];
      }
    | { outcome: "unknown" | "unavailable" }
  >;
}

export function harnessMismatch(read: HarnessRead): string | null;

export function globalLeftoverMismatch(input: {
  preflight: {
    check: { scope: string; tools: { tool: string }[] };
    reclaim: { previews: { tool: string; path: string }[] } | null;
  };
  onDisk: (path: string) => boolean;
}): string | null;

export function harnessOfflineMismatch(read: {
  freshness?: { outcome: string | null };
}): string | null;

export function unprefixedHashes(lockfileText: string): string[];

export function releaseMirrorProblem(input: {
  expected: Record<string, string>;
  mirrored: Record<string, string>;
}): string | null;
