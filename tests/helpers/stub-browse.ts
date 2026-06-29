// Shared test helper: a BrowseFilesystem wired to an unreachable home root, for
// tests that exercise other routes but must satisfy createApp's browse
// dependency. The browse route is never hit in those scenarios, so the root is
// inert; the endpoint itself is covered in tests/integration/server-filesystem.
import { BrowseFilesystem, NodeFileSystem } from "@maestro/core";

export function stubBrowse(): BrowseFilesystem {
  return new BrowseFilesystem({
    fs: new NodeFileSystem(),
    homeRoot: () => "/nonexistent-maestro-home",
  });
}
