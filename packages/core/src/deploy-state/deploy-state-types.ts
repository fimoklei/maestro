// A neutral module, so the reader and its pure grouping helper share these
// shapes without importing each other (architecture.md).
export type DeployedPrimitive = {
  type: "skill";
  name: string;
  version: string;
};

// An entry that yielded no primitive, surfaced with its reason so the cockpit
// warns instead of silently dropping it — and so "one entry could not be read"
// never reads as "this lockfile is broken" (#357).
export type SkippedEntry =
  | { reason: "unsupported-type"; virtualPath: string; packageType: string }
  | { reason: "unreadable"; virtualPath: string | null };
