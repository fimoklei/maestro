// Shared deploy-state value shapes, kept in a neutral module so the reader and
// its per-tool grouping helper both depend on them without importing each other
// (the reader owns the I/O, the helper is pure — architecture.md). A deployed
// primitive is surfaced as { type, name, version }; a skipped entry is one we
// could parse but whose package_type is not supported yet, surfaced so the
// cockpit can warn instead of silently dropping it.
export type DeployedPrimitive = {
  type: "skill";
  name: string;
  version: string;
};

export type SkippedEntry = { virtualPath: string; packageType: string };
