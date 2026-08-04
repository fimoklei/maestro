// One repository-wide semantic version proposed from the team delta: major for
// a removed or renamed skill, minor for a new one, patch when only existing
// skills changed. The author may still pick any step, so all three candidate
// versions travel with the proposal (ADR-0021, #519).
import type { SkillMovement } from "./skill-movements";

export type SemverStep = "major" | "minor" | "patch";

export type VersionProposal = {
  previousTag: string | null;
  proposedStep: SemverStep;
  reason: string;
  // The version each step would produce, so the selector never re-derives
  // semver in the browser.
  versions: Record<SemverStep, string>;
};

type SemverParts = { major: number; minor: number; patch: number };

// A missing or unparseable tag counts as v0.0.0, so a first release bumps from
// zero rather than being special-cased downstream.
const parseTag = (tag: string | null): SemverParts => {
  const match = tag === null ? null : /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (match === null) {
    return { major: 0, minor: 0, patch: 0 };
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
};

const bump = (parts: SemverParts, step: SemverStep): string => {
  const next =
    step === "major"
      ? { major: parts.major + 1, minor: 0, patch: 0 }
      : step === "minor"
        ? { major: parts.major, minor: parts.minor + 1, patch: 0 }
        : { major: parts.major, minor: parts.minor, patch: parts.patch + 1 };
  return `v${next.major}.${next.minor}.${next.patch}`;
};

const REASONS: Record<SemverStep, string> = {
  major: "A skill was removed or renamed.",
  minor: "A skill was added.",
  patch: "Only existing skills changed.",
};

const stepFromMovements = (movements: SkillMovement[]): SemverStep => {
  if (movements.some((m) => m.kind === "removed" || m.kind === "renamed")) {
    return "major";
  }
  return movements.some((m) => m.kind === "added") ? "minor" : "patch";
};

export const proposeReleaseVersion = (
  previousTag: string | null,
  movements: SkillMovement[],
): VersionProposal => {
  const parts = parseTag(previousTag);
  const versions: Record<SemverStep, string> = {
    major: bump(parts, "major"),
    minor: bump(parts, "minor"),
    patch: bump(parts, "patch"),
  };

  // A never-tagged harness starts at v0.1.0 whatever moved, so the first
  // release has an explicit starting point (#519). The minor step lands there.
  if (previousTag === null) {
    return {
      previousTag,
      proposedStep: "minor",
      reason: "First release.",
      versions,
    };
  }

  const proposedStep = stepFromMovements(movements);
  return { previousTag, proposedStep, reason: REASONS[proposedStep], versions };
};
