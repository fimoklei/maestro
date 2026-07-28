// A neutral module, so the reader and its pure grouping helper share these
// shapes without importing each other (architecture.md).
export type DeployedPrimitive = {
  type: "skill";
  name: string;
  version: string;
};

// A parseable entry of an unsupported package_type, surfaced so the cockpit can
// warn instead of silently dropping it.
export type SkippedEntry = { virtualPath: string; packageType: string };
