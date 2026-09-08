// One repository-wide semantic version proposed from the team delta: major for
// a removed or renamed skill, minor for a new one, patch when only existing
// skills changed. The author may still pick any step, so all three candidate
// versions travel with the proposal (ADR-0021, #519).
import { RELEASE_TAG_PATTERN } from "./release-tag";
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

// BigInt, not Number: a version part may be any run of digits, and past the
// safe integer range Number rounds it or prints it as `1e+21`.
type SemverParts = { major: bigint; minor: bigint; patch: bigint };

// Null where there is no version to bump from — no tag, or a tag that is not a
// semantic version. Both are a first release, never a bump from an invented
// number.
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
  patch: "Only existing skills changed.",
};

// An empty delta is not a change: saying "only existing skills changed" would
// state a fact the delta does not carry (#519).
const NOTHING_CHANGED = "Nothing has changed since the last release.";

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
  const zero: SemverParts = { major: 0n, minor: 0n, patch: 0n };
  const from = parts ?? zero;
  const versions: Record<SemverStep, string> = {
    major: bump(from, "major"),
    minor: bump(from, "minor"),
    patch: bump(from, "patch"),
  };

  // A never-tagged harness starts at v0.1.0 whatever moved, so the first
  // release has an explicit starting point (#519). The minor step lands there.
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
