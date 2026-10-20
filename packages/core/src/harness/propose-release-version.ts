// Proposes one repository-wide version from the team delta (#519).

import type { HarnessMovement } from "./harness-movements";
import { RELEASE_TAG_PATTERN } from "./release-tag";

export type SemverStep = "major" | "minor" | "patch";

export type VersionProposal = {
  previousTag: string | null;
  proposedStep: SemverStep;
  reason: string;
  versions: Record<SemverStep, string>;
};

// BigInt: past the safe integer range Number rounds or prints `1e+21`.
type SemverParts = { major: bigint; minor: bigint; patch: bigint };

// Null (no tag, or not semver) means a first release.
const parseTag = (tag: string | null): SemverParts | null => {
  const match = tag === null ? null : RELEASE_TAG_PATTERN.exec(tag);
  if (match === null) {
    return null;
  }
  const [, major = "0", minor = "0", patch = "0"] = match;
  return { major: BigInt(major), minor: BigInt(minor), patch: BigInt(patch) };
};

const bump = (parts: SemverParts, step: SemverStep): string => {
  const next =
    step === "major"
      ? { major: parts.major + 1n, minor: 0n, patch: 0n }
      : step === "minor"
        ? { major: parts.major, minor: parts.minor + 1n, patch: 0n }
        : { major: parts.major, minor: parts.minor, patch: parts.patch + 1n };
  return `v${next.major}.${next.minor}.${next.patch}`;
};

const REASONS: Record<SemverStep, string> = {
  major: "A skill was deleted or renamed.",
  minor: "A skill was added.",
  patch: "No skill was added, deleted or renamed.",
};

const NOTHING_CHANGED = "Nothing has changed since the last release.";

// Only a skill change steps past patch: no target holds a prompt.
const stepFromMovements = (movements: HarnessMovement[]): SemverStep => {
  const skills = movements.filter((m) => m.type === "skill");
  if (skills.some((m) => m.kind === "removed" || m.kind === "renamed")) {
    return "major";
  }
  return skills.some((m) => m.kind === "added") ? "minor" : "patch";
};

export const proposeReleaseVersion = (
  previousTag: string | null,
  movements: HarnessMovement[],
): VersionProposal => {
  const parts = parseTag(previousTag);
  const zero: SemverParts = { major: 0n, minor: 0n, patch: 0n };
  const from = parts ?? zero;
  const versions: Record<SemverStep, string> = {
    major: bump(from, "major"),
    minor: bump(from, "minor"),
    patch: bump(from, "patch"),
  };

  // A never-tagged harness starts at v0.1.0, the minor step.
  if (parts === null) {
    return {
      previousTag: null,
      proposedStep: "minor",
      reason: "First release.",
      versions,
    };
  }

  const proposedStep = stepFromMovements(movements);
  return {
    previousTag,
    proposedStep,
    reason: movements.length === 0 ? NOTHING_CHANGED : REASONS[proposedStep],
    versions,
  };
};
