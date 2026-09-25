// A neutral module, so the reader and its pure grouping helper share these
// shapes without importing each other (architecture.md).
import type { GitHubPage } from "../git/github-page";
import type { PackageClass, PackageReading } from "../lockfile/lockfile";

export type DeployedPrimitive = {
  type: "skill";
  name: string;
  version: string;
  // Present only where the copy on disk disagrees with its recorded baseline
  // ("local-edits") or has no baseline to check it against ("unverified").
  // Absent is "clean", never "not checked" — an unread copy carries no key.
  copy?: "local-edits" | "unverified";
  // The skill's folder in the connected Harness at this release; absent where
  // nothing links (#1181).
  github?: GitHubPage;
};

// Which release a target follows, and how much of its selection the newest
// release touches (ADR-0031). Null is always "not known": the cockpit shows
// *Changes could not be read* rather than a count it did not measure.
export type ReleaseHead = {
  release: string;
  latestRelease: string | null;
  changed: number | null;
  // Which selected skills that count names, in the selection's own order.
  // Absent wherever `changed` is null — the per-skill reading is the same
  // comparison, so it is never known when the count is not (#956).
  changedSkills?: readonly string[];
  // The selection the count speaks about, and its size. The names answer
  // "where is this skill selected?" — a leftover copy on disk is not in it.
  selection?: readonly string[];
  selected: number;
  // ISO-8601 moment of the last comparison that succeeded, kept when a later
  // one fails; null when none ever has.
  comparedAt: string | null;
};

// A target still holding per-skill dependencies, by the release each group of
// them is pinned at, biggest group first. Never empty: no group is no status
// (ADR-0031, #950).
export type PinnedPerSkill = readonly { release: string; skills: number }[];

// An entry that yielded no primitive, surfaced with its reason rather than
// silently dropped (#357). The two package reasons keep an unmanageable skill
// apart from a different primitive (#358).
export type SkippedEntry =
  | {
      reason: "unsupported-type" | "unmanageable-skill" | "invalid-package";
      virtualPath: string;
      packageType: string;
    }
  | { reason: "unreadable"; virtualPath: string | null };

// A root package is read, never skipped: its skills come from its files
// (root-package-skills.ts), so it is excluded from this mapping by type.
const REASON: Record<
  Exclude<PackageClass, "skill" | "package">,
  SkippedEntry["reason"]
> = {
  other: "unsupported-type",
  unsupported: "unmanageable-skill",
  invalid: "invalid-package",
};

// One mapping, so the repo reader and the global grouping cannot classify the
// same entry differently.
export function skippedFromReading(
  reading: Exclude<PackageReading, { kind: "skill" | "package" }>,
  virtualPath: string,
): SkippedEntry {
  return {
    reason: REASON[reading.kind],
    virtualPath,
    packageType: reading.packageType,
  };
}
