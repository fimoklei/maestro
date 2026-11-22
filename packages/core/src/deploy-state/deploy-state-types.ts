import type { GitHubPage } from "../git/github-page";
import type { PackageClass, PackageReading } from "../lockfile/lockfile";

export type DeployedPrimitive = {
  type: "skill";
  name: string;
  version: string;
  copy?: "local-edits" | "edits-in-harness" | "unverified";
  github?: GitHubPage;
};

export type ReleaseHead = {
  release: string;
  latestRelease: string | null;
  changed: number | null;
  changedSkills?: readonly string[];
  selection?: readonly string[];
  selected: number;
  comparedAt: string | null;
};

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
