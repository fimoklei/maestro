import type { PackageClass, PackageReading } from "../lockfile/lockfile";

export type DeployedPrimitive = {
  type: "skill";
  name: string;
  version: string;
  // Absent means "clean", never "not checked": an unread copy carries no key.
  copy?: "local-edits" | "unverified";
};

// Null is always "not known", never a count that was not measured.
export type ReleaseHead = {
  release: string;
  latestRelease: string | null;
  changed: number | null;
  // Absent wherever `changed` is null: it is the same comparison.
  changedSkills?: readonly string[];
  selection?: readonly string[];
  selected: number;
  // Last successful comparison, kept when a later one fails.
  comparedAt: string | null;
};

// Biggest group first. Never empty: no group is no status.
export type PinnedPerSkill = readonly { release: string; skills: number }[];

export type SkippedEntry =
  | {
      reason: "unsupported-type" | "unmanageable-skill" | "invalid-package";
      virtualPath: string;
      packageType: string;
    }
  | { reason: "unreadable"; virtualPath: string | null };

const REASON: Record<
  Exclude<PackageClass, "skill" | "package">,
  SkippedEntry["reason"]
> = {
  other: "unsupported-type",
  unsupported: "unmanageable-skill",
  invalid: "invalid-package",
};

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
