// A neutral module, so the reader and its pure grouping helper share these
// shapes without importing each other (architecture.md).
import type { PackageClass, PackageReading } from "../lockfile/lockfile";

export type DeployedPrimitive = {
  type: "skill";
  name: string;
  version: string;
};

// An entry that yielded no primitive, surfaced with its reason so the cockpit
// warns instead of silently dropping it — and so "one entry could not be read"
// never reads as "this lockfile is broken" (#357). The two package reasons keep
// a skill Maestro cannot manage apart from a different primitive (#358).
export type SkippedEntry =
  | {
      reason: "unsupported-type" | "unsupported-package" | "invalid-package";
      virtualPath: string;
      packageType: string;
    }
  | { reason: "unreadable"; virtualPath: string | null };

const REASON: Record<Exclude<PackageClass, "skill">, SkippedEntry["reason"]> = {
  other: "unsupported-type",
  unsupported: "unsupported-package",
  invalid: "invalid-package",
};

// One mapping, so the repo reader and the global grouping cannot classify the
// same entry differently.
export function skippedFromReading(
  reading: Exclude<PackageReading, { kind: "skill" }>,
  virtualPath: string,
): SkippedEntry {
  return {
    reason: REASON[reading.kind],
    virtualPath,
    packageType: reading.packageType,
  };
}
